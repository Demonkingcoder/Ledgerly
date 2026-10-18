import { useState } from 'react';
import { fireEvent, render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../src/app/App';
import { LedgerProvider } from '../src/app/ledger-context';
import { Modal } from '../src/components/ui';
import { ToastProvider } from '../src/components/toast';
import { SalesPage } from '../src/features/sales/SalesPage';
import { ledgerService } from '../src/app/composition';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
    {open && <Modal title="Review record" onClose={() => setOpen(false)}>
      <button type="button">First action</button>
      <button type="button">Last action</button>
    </Modal>}
  </>;
}

describe('modal keyboard behavior', () => {
  it('keeps Tab inside the dialog and restores focus after Escape', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const opener = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Review record' });
    const buttons = within(dialog).getAllByRole('button');
    expect(document.activeElement).toBe(buttons[0]);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(buttons.at(-1));
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(buttons[0]);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('mobile navigation keyboard behavior', () => {
  it('keeps focus in the open navigation drawer and returns it to the menu button', async () => {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: true, media, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
      dispatchEvent: () => false,
    }));
    const user = userEvent.setup();
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><LedgerProvider><Routes>
      <Route element={<AppLayout />}><Route path="/" element={<h1>Overview</h1>} /></Route>
    </Routes></LedgerProvider></MemoryRouter>);

    const menuButton = await screen.findByRole('button', { name: 'Open navigation' });
    await user.click(menuButton);
    const drawer = await screen.findByRole('dialog', { name: 'Navigation menu' });
    const focusable = within(drawer).getAllByRole('button').concat(within(drawer).getAllByRole('link'));
    await waitFor(() => expect(document.activeElement).toBe(focusable[0]));

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(focusable.at(-1));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).toBeNull();
    expect(document.activeElement).toBe(menuButton);
  });
});

describe('checkout customer entry', () => {
  it('creates a customer from checkout and prints their contact details on the receipt', async () => {
    const user = userEvent.setup();
    render(<ToastProvider><LedgerProvider><SalesPage /></LedgerProvider></ToastProvider>);
    await user.click(await screen.findByRole('button', { name: 'Record a sale' }));

    const dialog = await screen.findByRole('dialog', { name: 'Record a sale' });
    await user.selectOptions(within(dialog).getAllByRole('combobox')[0], '__add_customer__');
    await user.type(within(dialog).getByLabelText('Name'), 'Checkout Customer');
    await user.type(within(dialog).getByLabelText('Phone number'), '+91 98765 43210');
    await user.type(within(dialog).getByLabelText('Email'), 'checkout@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Save sale' }));

    const receipt = await screen.findByRole('dialog', { name: 'Receipt preview' });
    expect(within(receipt).getByText('Checkout Customer')).toBeTruthy();
    expect(within(receipt).getByText('+91 98765 43210')).toBeTruthy();
    expect(within(receipt).getByText('checkout@example.com')).toBeTruthy();
    await waitFor(async () => expect((await ledgerService.snapshot()).customers.some((customer) => customer.name === 'Checkout Customer' && customer.address === '')).toBe(true));
  });
});
