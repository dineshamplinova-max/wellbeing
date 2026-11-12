import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FaUser, FaLock, FaExclamationCircle } from 'react-icons/fa';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:8000/login', { username, password });
      // The session is an httpOnly cookie set by the server; only the username is
      // kept here, for display and routing.
      localStorage.removeItem('token');
      localStorage.setItem('tokenUser', response.data.user.username);
      navigate(`/`);
    } catch (err) {
      if (err.response?.status === 429) {
        setError(err.response.data?.error || 'Too many sign-in attempts. Please wait and try again.');
      } else {
        setError('Invalid username or password');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-wb-primary-soft via-wb-surface to-wb-accent-soft flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {error && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="fixed inset-0 bg-wb-text bg-opacity-50 transition-opacity" onClick={() => setError('')}></div>
          <div className="relative bg-wb-surface rounded-lg max-w-md w-full p-6 shadow-xl transform transition-all">
            <div className="flex items-center">
              <FaExclamationCircle className="h-6 w-6 text-wb-danger mr-3" />
              <h3 className="text-lg font-medium text-wb-text">Error</h3>
            </div>
            <p className="mt-2 text-sm text-wb-muted">{error}</p>
            <button
              onClick={() => setError('')}
              className="mt-4 w-full inline-flex justify-center rounded-md border border-transparent px-4 py-2 bg-wb-danger text-base font-medium text-white hover:bg-wb-danger-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-wb-danger sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-wb-text">
          Welcome Back
        </h2>
        <p className="mt-2 text-center text-sm text-wb-muted">
          Sign in to continue your journey
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-wb-surface py-8 px-4 shadow-xl rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-wb-muted">
                Username
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaUser className="h-5 w-5 text-wb-muted" />
                </div>
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-wb-control rounded-md focus:outline-none focus:ring-2 focus:ring-wb-primary focus:border-transparent sm:text-sm"
                  placeholder="Enter your username"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-wb-muted">
                Password
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaLock className="h-5 w-5 text-wb-muted" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-wb-control rounded-md focus:outline-none focus:ring-2 focus:ring-wb-primary focus:border-transparent sm:text-sm"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-wb-primary hover:bg-wb-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-wb-primary transition-colors"
              >
                Sign in
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-wb-border"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-wb-surface text-wb-muted">Or</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3">
              <a
                href="/signup"
                className="wb-hover-btn w-full inline-flex justify-center py-3 px-4 rounded-md shadow-sm bg-wb-surface text-sm font-medium text-wb-muted border border-wb-border hover:bg-wb-subtle focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-wb-primary transition-colors"
              >
                Create new account
              </a>
              <a
                href="/"
                className="w-full inline-flex justify-center py-3 px-4 rounded-md text-sm font-medium text-wb-muted hover:text-wb-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-wb-primary transition-colors"
              >
                Back to Homepage
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;


