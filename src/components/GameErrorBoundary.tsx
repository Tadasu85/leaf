import React, { Component, ErrorInfo, ReactNode } from 'react';
import logger from '../utils/Logger';

interface Props {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onRecover?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class GameErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('GameErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRecover = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });

    if (this.props.onRecover) {
      this.props.onRecover();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="game-error-boundary">
          <div className="game-error-boundary__content">
            <div className="game-error-boundary__icon">⚠️</div>
            <h3>Game Error</h3>
            <p>The game encountered an unexpected error. Your progress is safe.</p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="game-error-boundary__details">
                <summary>Debug Info</summary>
                <div className="game-error-boundary__error">
                  <strong>Error:</strong> {this.state.error.message}
                </div>
                {this.state.errorInfo && (
                  <div className="game-error-boundary__stack">
                    <strong>Component Stack:</strong>
                    <pre>{this.state.errorInfo.componentStack}</pre>
                  </div>
                )}
              </details>
            )}
            
            <div className="game-error-boundary__actions">
              <button 
                onClick={this.handleRecover}
                className="game-error-boundary__recover-btn"
              >
                Try to Recover
              </button>
              <button 
                onClick={this.handleReload}
                className="game-error-boundary__reload-btn"
              >
                Reload Game
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GameErrorBoundary; 