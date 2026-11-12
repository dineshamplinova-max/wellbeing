import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import axios from 'axios';

// The session lives in an httpOnly cookie set by the API, so every axios request
// must include credentials. fetch() calls pass credentials: 'include' themselves.
axios.defaults.withCredentials = true;

// An expired or missing session: forget the stored username and go to sign-in.
// Failed sign-in attempts (also 401) are handled by the login form instead.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = String(error?.config?.url || '');
    if (error?.response?.status === 401 && !url.endsWith('/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('tokenUser');
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
        <App />
  </React.StrictMode>
);
