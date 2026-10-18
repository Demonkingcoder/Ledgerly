import { useState } from 'react';
import { fireEvent, render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../src/app/App';
import { LedgerProvider } from '../src/app/ledger-context';
import { ConfirmDialog, Modal } from '../src/components/ui';
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

function ConfirmHarness() {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Open confirmation</button>
    <output>{confirmed ? 'Archived' : 'Not archived'}</output>
    {open && <ConfirmDialog title="Archive item?" description="Existing history will remain." confirmLabel="Archive item" danger onClose={() => setOpen(false)} onConfirm={() => { setConfirmed(true); setOpen(false); }} />}
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

  it('requires an explicit choice in the shared confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<ConfirmHarness />);
    await user.click(screen.getByRole('button', { name: 'Open confirmation' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive item?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Not archived')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Open confirmation' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Archive item?' })).getByRole('button', { name: 'Archive item' }));
    expect(screen.getByText('Archived')).toBeTruthy();
  });
});

describe('mobile navigation keyboard behavior', () => {
  it('keeps focus in the open navigation drawer and returns it to the menu button', async () => {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: true, media, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
      dispatchEvent: () => false,
    }));
    await ledgerService.initialize();
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
    await ledgerService.initialize();
    render(<ToastProvider><LedgerProvider><SalesPage /></LedgerProvider></ToastProvider>);
    await user.click(await screen.findByRole('button', { name: 'New sale' }));

    const cart = await screen.findByRole('form', { name: 'Sale cart' });
    await user.click(screen.getByRole('button', { name: 'Add A4 Copier Paper to sale' }));
    await user.selectOptions(within(cart).getByRole('combobox', { name: /Customer/ }), '__add_customer__');
    await user.type(within(cart).getByLabelText('Name'), 'Checkout Customer');
    await user.type(within(cart).getByLabelText('Phone number'), '+91 98765 43210');
    await user.type(within(cart).getByLabelText('Email'), 'checkout@example.com');
    await user.click(within(cart).getByRole('button', { name: /Complete sale/ }));

    const receipt = await screen.findByRole('dialog', { name: 'Sale complete' });
    expect(within(receipt).getByText('Checkout Customer')).toBeTruthy();
    expect(within(receipt).getByText('+91 98765 43210')).toBeTruthy();
    expect(within(receipt).getByText('checkout@example.com')).toBeTruthy();
    await waitFor(async () => expect((await ledgerService.snapshot()).customers.some((customer) => customer.name === 'Checkout Customer' && customer.address === '')).toBe(true));
  });
});
