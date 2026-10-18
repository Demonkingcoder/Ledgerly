import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, Send, Sparkles } from 'lucide-react';
import { useLedger } from '../../app/ledger-context';
import { PageHeading, Panel } from '../../components/ui';
import { answerBusinessQuestion } from './answer-question';

const prompts = ['What were my sales this week?', 'Which products need reordering?', 'How much do customers owe me?', 'What sold best?'];

export function AssistantPage() {
  const { snapshot } = useLedger();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Array<{ question: string; answer: string }>>([]);
  function ask(value = question) {
    const clean = value.trim();
    if (!clean) return;
    setMessages((current) => [...current, { question: clean, answer: answerBusinessQuestion(clean, snapshot) }]);
    setQuestion('');
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); ask(); }
  return <>
    <PageHeading eyebrow="LOCAL BUSINESS ASSISTANT" title="Business insights" description="Ask about your saved records. Ledgerly answers with local, rule-based calculations." />
    <div className="assistant-layout"><Panel className="assistant-panel"><div className="assistant-intro"><div className="assistant-mark"><Sparkles size={20} /></div><div><span className="local-tag-pill">RULE-BASED · LOCAL</span><h2>Ask Ledgerly</h2><p>Answers are calculated from your records in this browser. No business data is sent to an AI service.</p></div></div>
      <div className="assistant-messages" aria-live="polite">{messages.length ? messages.map((message, index) => <div className="message-pair" key={`${index}-${message.question}`}><div className="user-message">{message.question}</div><div className="assistant-message"><span className="assistant-message-icon"><Sparkles size={14} /></span><p>{message.answer}</p></div></div>) : <div className="assistant-empty"><div className="assistant-empty-icon">✳</div><strong>Your shop, in plain language</strong><p>Choose a question below or ask about sales, stock, balances, or best-selling products.</p></div>}</div>
      <form className="assistant-input" onSubmit={submit}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about sales, stock or balances..." aria-label="Ask Ledgerly a question" /><button type="submit" disabled={!question.trim()} aria-label="Ask question"><Send size={17} /></button></form>
    </Panel><aside className="assistant-side"><Panel><div className="panel-heading"><div><h2>Try asking</h2><p>Supported question types</p></div></div><div className="prompt-list">{prompts.map((prompt) => <button key={prompt} onClick={() => ask(prompt)}>{prompt}<ArrowRight size={14} /></button>)}</div></Panel><div className="privacy-card"><LockKeyhole size={17} /><strong>Private by default</strong><p>This assistant reads a small set of saved totals and product facts in your browser. It cannot change business records.</p></div></aside></div>
  </>;
}
