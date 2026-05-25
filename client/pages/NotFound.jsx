import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div style={{
      minHeight: 'calc(100vh - 60px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 80, marginBottom: 16, opacity: 0.4 }}>404</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>Page Not Found</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 28 }}>The page you're looking for doesn't exist.</p>
        <Link to="/" className="btn btn-primary">Go Home</Link>
      </div>
    </div>
  );
}
