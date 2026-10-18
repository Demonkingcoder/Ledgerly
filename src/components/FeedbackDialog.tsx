import { useState, type FormEvent } from 'react';
import { useToast } from './toast';
import { Field, FormActions, FormError, Modal, SelectInput, TextAreaInput, TextInput } from './ui';

export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const notify = useToast();
  const [category, setCategory] = useState<'bug' | 'usability' | 'feature'>('usability');
  const [goal, setGoal] = useState('');
  const [problem, setProblem] = useState('');
  const [improvement, setImprovement] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goal.trim() || !problem.trim() || !improvement.trim()) {
      setError('Complete the first three fields so your feedback draft is useful.');
      return;
    }
    const text = [
      'Ledgerly feedback draft (not submitted)',
      `Category: ${category}`,
      `Date: ${new Date().toLocaleString()}`,
      '',
      'What were you trying to do?', goal.trim(),
      '',
      'What was confusing or did not work?', problem.trim(),
      '',
      'What would you improve?', improvement.trim(),
      '',
      'Contact details (optional):', contact.trim() || 'Not provided',
      '',
      'This draft was created locally. Ledgerly has no feedback submission service configured.',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ledgerly-feedback-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Feedback draft downloaded locally. It has not been sent.');
    onClose();
  }

  return <Modal title="Send feedback" description="Create a local draft you can review and send through your preferred channel." onClose={onClose}>
    <form className="form-layout one-column" onSubmit={submit}>
      <Field label="Feedback type"><SelectInput value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option value="bug">Something did not work</option><option value="usability">Something was confusing</option><option value="feature">Feature idea</option></SelectInput></Field>
      <Field label="What were you trying to do?"><TextAreaInput required rows={2} maxLength={1000} value={goal} onChange={(event) => setGoal(event.target.value)} /></Field>
      <Field label="What was confusing or did not work?"><TextAreaInput required rows={2} maxLength={1500} value={problem} onChange={(event) => setProblem(event.target.value)} /></Field>
      <Field label="What would you improve?"><TextAreaInput required rows={2} maxLength={1500} value={improvement} onChange={(event) => setImprovement(event.target.value)} /></Field>
      <Field label="Contact details" hint="Optional"><TextInput type="email" autoComplete="email" maxLength={200} value={contact} onChange={(event) => setContact(event.target.value)} placeholder="you@example.com" /></Field>
      <p className="feedback-privacy">This draft does not include your sales, inventory, customer list, passwords, or other business records. Nothing is sent from Ledgerly.</p>
      <FormError message={error} />
      <FormActions onCancel={onClose} submitText="Download feedback draft" />
    </form>
  </Modal>;
}
