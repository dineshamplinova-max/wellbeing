import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Icon1 from '../Images/icon2.png';
import {
  FaUser,
  FaSignOutAlt,
  FaTrash,
  FaBars,
  FaTimes
} from 'react-icons/fa';

const Navbar = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const navigate = useNavigate();
  const user = localStorage.getItem('tokenUser');

  useEffect(() => {
    // The session itself is an httpOnly cookie; tokenUser only records who signed in.
    if (localStorage.getItem('tokenUser')) {
      setIsLoggedIn(true);
    }
  }, []);

  const toggleDropdown = () => setDropdownOpen(!dropdownOpen);
  const toggleMobileMenu = () => setMobileMenuOpen(!mobileMenuOpen);

  const handleLogout = async (e) => {
    e.preventDefault();
    try {
      // Ask the server to clear the httpOnly session cookie.
      await axios.post('http://localhost:8000/api/auth/logout');
    } catch (err) {
      console.error('Error logging out:', err);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('tokenUser');
    setIsLoggedIn(false);
    navigate('/login');
  };

  const handleDelete = () => setShowDeleteModal(true);
  const closeModal = () => setShowDeleteModal(false);

  const confirmDelete = async () => {
    try {
      const response = await fetch(`http://localhost:8000/delete-user/${user}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        console.error('Deleting the profile failed with status', response.status);
        setShowDeleteModal(false);
        return;
      }
      localStorage.removeItem('token');
      localStorage.removeItem('tokenUser');
      setIsLoggedIn(false);
      navigate('/login');
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const navLinks = [
    { href: `/${user}/dashboard`, text: 'Dashboard' },
    { href: `/${user}/mood`, text: 'Mood Tracker' },
    { href: `/${user}/meditation`, text: 'Meditation' },
    { href: `/${user}/therapist`, text: 'AI Support' },
    { href: `/${user}/quiz`, text: 'Quiz' },
    { href: `/${user}/anonymoussharing`, text: 'Anonymous Sharing' },
    { href: '/aboutus', text: 'About Us' },
  ];

  return (
    <nav className="fixed w-full top-0 z-50 border-b border-wb-border bg-wb-surface/85 backdrop-blur-lg shadow-wb-sm transition-transform duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <a
            href="/"
            className="flex items-center space-x-2 transition-transform duration-200 hover:scale-105"
          >
            <img className="h-10 w-auto" src={Icon1} alt="Logo" />
          </a>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex lg:items-center lg:space-x-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="wb-hover-btn text-wb-muted hover:text-wb-primary px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 hover:scale-105"
              >
                {link.text}
              </a>
            ))}
          </div>

          {/* Right Section */}
          <div className="flex items-center space-x-4">
            {/* User Menu */}
            {isLoggedIn ? (
              <div className="relative">
                <button
                  onClick={toggleDropdown}
                  className="flex items-center space-x-2 p-2 rounded-full hover:bg-wb-subtle transition-all duration-200 hover:scale-105"
                >
                  <img
                    className="h-8 w-8 rounded-full border-2 border-wb-primary"
                    src="https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg"
                    alt="Profile"
                  />
                </button>

                {dropdownOpen && (
                  <div
                    className="absolute right-0 mt-2 w-48 bg-wb-surface rounded-lg shadow-lg py-1 ring-1 ring-wb-text ring-opacity-5 transition-all duration-200 transform origin-top-right"
                  >
                    <a
                      href={`/${user}/profile`}
                      className="wb-hover-btn flex items-center px-4 py-2 text-sm text-wb-muted hover:bg-wb-primary-soft transition-colors duration-200"
                    >
                      <FaUser className="mr-2" /> Profile
                    </a>
                    <button
                      onClick={handleLogout}
                      className="flex items-center w-full px-4 py-2 text-sm text-wb-muted hover:bg-wb-primary-soft transition-colors duration-200"
                    >
                      <FaSignOutAlt className="mr-2" /> Sign out
                    </button>
                    <button
                      onClick={handleDelete}
                      className="flex items-center w-full px-4 py-2 text-sm text-wb-danger hover:bg-wb-danger/10 transition-colors duration-200"
                    >
                      <FaTrash className="mr-2" /> Delete Profile
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <a
                href="/login"
                className="wb-hover-btn inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-wb-primary hover:bg-wb-primary-hover transition-all duration-200 hover:scale-105"
              >
                Login <span className="ml-2">→</span>
              </a>
            )}

            {/* Mobile menu button */}
            <button
              onClick={toggleMobileMenu}
              className="lg:hidden p-2 rounded-md hover:bg-wb-subtle transition-all duration-200 hover:scale-110"
            >
              {mobileMenuOpen ? <FaTimes className="w-6 h-6" /> : <FaBars className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={`lg:hidden bg-wb-surface border-t transition-all duration-300 ${
          mobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className="px-2 pt-2 pb-3 space-y-1">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="wb-hover-btn block px-3 py-2 rounded-md text-base font-medium text-wb-muted hover:text-wb-primary hover:bg-wb-primary-soft transition-colors duration-200"
            >
              {link.text}
            </a>
          ))}
        </div>
      </div>

      {/* Delete Profile Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-wb-text bg-opacity-50 transition-opacity duration-300">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="bg-wb-surface rounded-lg max-w-md w-full p-6 shadow-xl transform transition-all duration-300">
              <h3 className="text-lg font-semibold text-wb-text mb-4">
                Delete Profile
              </h3>
              <p className="text-sm text-wb-muted mb-6">
                Are you sure you want to delete your profile? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-4">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-wb-muted hover:bg-wb-subtle rounded-md transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 text-sm font-medium text-white bg-wb-danger hover:bg-wb-danger-hover rounded-md transition-colors duration-200"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
