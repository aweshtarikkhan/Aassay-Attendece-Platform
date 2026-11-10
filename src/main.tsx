import React from 'react'
import ReactDOM from 'react-dom/client'

class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    console.error("APP CRASH:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
          <div style={{ maxWidth: 420, width: '100%', backgroundColor: '#ffffff', borderRadius: 20, padding: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <span style={{ color: '#ef4444', fontSize: 24, fontWeight: 'bold' }}>!</span>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginBottom: 8 }}>Something went wrong</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              The application encountered a display issue. Please reload to restore your session.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => window.location.reload()}
                style={{ width: '100%', padding: '12px 16px', backgroundColor: '#ea580c', color: '#ffffff', border: 'none', borderRadius: 12, fontWeight: 'bold', cursor: 'pointer', fontSize: 14 }}
              >
                Reload App
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem('attendance_stats');
                    localStorage.removeItem('attendance_today_record');
                    localStorage.removeItem('attendance_holidays');
                  } catch {}
                  window.location.href = '/dashboard';
                }}
                style={{ width: '100%', padding: '10px 16px', backgroundColor: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 12, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
              >
                Clear Temp Cache & Reopen
              </button>
            </div>
            {this.state.error && (
              <details style={{ marginTop: 16, textAlign: 'left', fontSize: 11, color: '#94a3b8' }}>
                <summary style={{ cursor: 'pointer' }}>Error Details</summary>
                <pre style={{ marginTop: 8, padding: 8, backgroundColor: '#f1f5f9', borderRadius: 8, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>,
)
 
