import { Component } from 'react';
import { COLORS } from './theme.js';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 32, textAlign: 'center',
          background: COLORS.surface, border: `1px solid ${COLORS.red}30`,
          borderRadius: 12, margin: 20,
        }}>
          <div style={{ fontSize: 16, color: COLORS.red, fontWeight: 700, marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 16, fontFamily: 'monospace' }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '8px 24px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              letterSpacing: 1, cursor: 'pointer',
              background: `${COLORS.gold}15`, border: `1px solid ${COLORS.gold}40`, color: COLORS.gold,
            }}
          >
            RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
