'use client';

import { useState } from 'react';

export function ContactForm() {
  const [confirmation, setConfirmation] = useState('');

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? 'there').trim() || 'there';
    setConfirmation(
      `Thanks, ${name}. This is a UI preview — nothing was sent and your note stayed in the browser.`,
    );
  }

  return (
    <form className="contact-form" onSubmit={submit}>
      <div className="form-field">
        <input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder=" "
          required
        />
        <label htmlFor="contact-name">Your name</label>
        <span className="form-field__line" aria-hidden="true" />
      </div>
      <div className="form-field">
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder=" "
          required
        />
        <label htmlFor="contact-email">Email address</label>
        <span className="form-field__line" aria-hidden="true" />
      </div>
      <div className="form-field form-field--full">
        <input
          id="contact-setup"
          name="setup"
          type="text"
          autoComplete="organization"
          placeholder=" "
        />
        <label htmlFor="contact-setup">
          Where would you run it? <span>(optional)</span>
        </label>
        <span className="form-field__line" aria-hidden="true" />
      </div>
      <div className="form-field form-field--full form-field--textarea">
        <textarea
          id="contact-question"
          name="question"
          rows={4}
          placeholder=" "
          minLength={12}
          required
        />
        <label htmlFor="contact-question">What would you like to understand?</label>
        <span className="form-field__line" aria-hidden="true" />
      </div>
      <div className="contact-form__footer form-field--full">
        <p>This preview keeps the note in your browser. Nothing is sent to a server.</p>
        <button className="submit-button" type="submit">
          <span>Preview the note</span>
          <span aria-hidden="true">↗</span>
        </button>
      </div>
      <p className="contact-form__status form-field--full" role="status" aria-live="polite">
        {confirmation}
      </p>
    </form>
  );
}
