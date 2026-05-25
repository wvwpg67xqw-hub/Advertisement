import React from 'react';
import { Link } from 'react-router-dom';

export default function Success() {
  return (
    <div style={{
      minHeight: 'calc(100vh - 60px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{
          width: 90, height: 90,
          background: 'rgba(34,197,94,0.15)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 44,
          margin: '0 auto 28px',
        }}>
          ✅
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 700, marginBottom: 14 }}>Application Submitted!</h1>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 32 }}>
          Thank you for applying. Our team will review your application and get back to you within <strong style={{ color: 'var(--text)' }}>48 hours</strong>. Keep an eye on your Discord messages.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/" className="btn btn-primary">Back to Home</Link>
          <Link to="/apply" className="btn btn-ghost">Apply for Another Role</Link>
        </div>
      </div>
    </div>
  );
}
