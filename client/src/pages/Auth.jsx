import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate, Link } from 'react-router-dom';
import { Wand2, Mail, Lock } from 'lucide-react';
import '../App.css';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data.session) navigate('/formatter');
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage('Registration successful! Check your email to verify your account or login directly.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container d-flex align-items-center justify-content-center min-vh-100">
      <div className="auth-card glass-panel p-5 animate-fade-in" style={{ width: '100%', maxWidth: '450px' }}>
        <div className="text-center mb-5">
          <Link to="/" className="text-decoration-none d-inline-flex align-items-center gap-2 fw-bold fs-3 text-gradient mb-4">
            <Wand2 className="text-primary" /> FormatAI
          </Link>
          <h2 className="text-light fw-bold">{isLogin ? 'Welcome Back' : 'Create an Account'}</h2>
          <p className="text-secondary">
            {isLogin ? 'Enter your credentials to access the AI formatter.' : 'Sign up to start formatting documents instantly.'}
          </p>
        </div>

        {error && (
          <div className="alert alert-danger d-flex align-items-center mb-4" role="alert">
            <i className="bi bi-exclamation-octagon-fill me-2"></i>
            {error}
          </div>
        )}

        {message && (
          <div className="alert alert-success d-flex align-items-center mb-4" role="alert">
            <i className="bi bi-check-circle-fill me-2"></i>
            {message}
          </div>
        )}

        <form onSubmit={handleAuth}>
          <div className="mb-4">
            <label className="form-label text-light">Email address</label>
            <div className="input-group">
              <span className="input-group-text bg-dark border-secondary text-secondary">
                <Mail size={18} />
              </span>
              <input
                type="email"
                className="form-control bg-dark border-secondary text-light custom-input"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="mb-5">
            <label className="form-label text-light">Password</label>
            <div className="input-group">
              <span className="input-group-text bg-dark border-secondary text-secondary">
                <Lock size={18} />
              </span>
              <input
                type="password"
                className="form-control bg-dark border-secondary text-light custom-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-gradient btn-lg w-100 rounded-pill mb-4 position-relative overflow-hidden"
            disabled={loading}
          >
            {loading ? (
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            ) : (
              isLogin ? 'Sign In' : 'Sign Up'
            )}
          </button>
        </form>

        <div className="text-center">
          <p className="text-secondary mb-0">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              className="btn btn-link text-primary text-decoration-none p-0 fw-bold"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
