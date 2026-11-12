//signup page
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUser, FaLock, FaEnvelope, FaUserCircle, FaInfoCircle, FaExclamationCircle, FaImage, FaSpinner } from 'react-icons/fa';

const SIGNUP_URL = 'http://localhost:8000/signup';
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
export const MAX_ORIGINAL_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024; // backend limit
const MAX_IMAGE_DIMENSION = 1024;
const JPEG_QUALITIES = [0.85, 0.7, 0.55];
const SIGNUP_TIMEOUT_MS = 60 * 1000;

// Returns an error message for a picture that cannot be used, or '' if it is fine.
export const validateImageFile = (file) => {
    const name = (file.name || '').toLowerCase();
    const typeOk = file.type
        ? ALLOWED_IMAGE_TYPES.includes(file.type)
        : ALLOWED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
    if (!typeOk) return 'Please choose a JPG, PNG or WebP image.';
    if (file.size > MAX_ORIGINAL_IMAGE_BYTES) return 'This image is larger than 15 MB. Please choose a smaller one.';
    if (file.size === 0) return 'This image file is empty. Please choose another one.';
    return '';
};

// Scales width/height down so neither exceeds maxDimension, keeping the aspect ratio.
export const fitWithin = (width, height, maxDimension = MAX_IMAGE_DIMENSION) => {
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

const loadImage = (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('decode'));
    image.src = url;
});

const canvasToBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

// Resizes the picture to at most 1024 px on its longest side and re-encodes it
// as JPEG using the browser's Canvas API. A small original is kept as it is
// when re-encoding would not make it smaller.
export const compressImage = async (file) => {
    const url = URL.createObjectURL(file);
    try {
        const image = await loadImage(url);
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        if (!sourceWidth || !sourceHeight) throw new Error('decode');
        const { width, height } = fitWithin(sourceWidth, sourceHeight);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas');
        // JPEG has no transparency: paint transparent PNG/WebP areas white, not black.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        const resized = width !== sourceWidth || height !== sourceHeight;
        for (const quality of JPEG_QUALITIES) {
            const blob = await canvasToBlob(canvas, quality);
            if (!blob) throw new Error('encode');
            if (!resized && file.size <= blob.size && file.size <= MAX_UPLOAD_IMAGE_BYTES) {
                return { blob: file, name: file.name };
            }
            if (blob.size <= MAX_UPLOAD_IMAGE_BYTES) {
                const baseName = (file.name || 'profile').replace(/\.[^.]+$/, '') || 'profile';
                return { blob, name: `${baseName}.jpg` };
            }
        }
        throw new Error('too-large');
    } finally {
        URL.revokeObjectURL(url);
    }
};

const Signup = () => {
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        name: '',
        email: '',
        gender: '',
        bio: '',
        age: ''
    });

    // profilePicture holds the processed upload: { blob, name }.
    const [profilePicture, setProfilePicture] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [imageError, setImageError] = useState('');
    const [isProcessingImage, setIsProcessingImage] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [missingDetailsError, setMissingDetailsError] = useState('');
    const navigate = useNavigate();
    const submittingRef = useRef(false);
    const selectionRef = useRef(0);

    // Release each preview URL when it is replaced or the page unmounts.
    useEffect(() => () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    }, [previewUrl]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });
    };

    const clearPicture = () => {
        selectionRef.current += 1; // ignore any compression still running
        setProfilePicture(null);
        setPreviewUrl('');
        setIsProcessingImage(false);
    };

    const handleFileChange = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = ''; // lets the same file be chosen again after an error
        if (!file) return;

        clearPicture();
        const problem = validateImageFile(file);
        if (problem) {
            setImageError(problem);
            return;
        }
        setImageError('');
        setPreviewUrl(URL.createObjectURL(file));
        setIsProcessingImage(true);

        const selection = selectionRef.current;
        try {
            const processed = await compressImage(file);
            if (selection !== selectionRef.current) return;
            setProfilePicture(processed);
        } catch {
            if (selection !== selectionRef.current) return;
            setPreviewUrl('');
            setImageError('We could not process this image. Please try a different JPG, PNG or WebP picture.');
        } finally {
            if (selection === selectionRef.current) setIsProcessingImage(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submittingRef.current || isProcessingImage) return;

        const requiredFields = ['username', 'password', 'name', 'email', 'gender', 'age'];
        const missingFields = requiredFields.filter(field => !formData[field]);

        if (missingFields.length > 0) {
            setMissingDetailsError('Please fill in all required fields.');
            return;
        }

        submittingRef.current = true;
        setIsSubmitting(true);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SIGNUP_TIMEOUT_MS);
        let succeeded = false;
        try {
            const formDataWithFile = new FormData();
            for (const key in formData) {
                formDataWithFile.append(key, formData[key]);
            }
            if (profilePicture) {
                formDataWithFile.append('profilePicture', profilePicture.blob, profilePicture.name);
            }

            const response = await fetch(SIGNUP_URL, {
                method: 'POST',
                body: formDataWithFile,
                signal: controller.signal,
            });

            // Show the server's message for duplicates (409), validation (400),
            // rejected uploads (400) and rate limiting (429).
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                setError(data.msg || data.error || `Sign up failed (error ${response.status}). Please try again.`);
                return;
            }

            succeeded = true;
            navigate('/login');
        } catch (err) {
            if (err && err.name === 'AbortError') {
                setError('Creating your account is taking too long. Please check your connection and try again.');
            } else {
                setError('We could not reach the server. Please check your internet connection and try again.');
            }
        } finally {
            clearTimeout(timeoutId);
            if (!succeeded) {
                submittingRef.current = false;
                setIsSubmitting(false);
            }
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-wb-primary-soft via-wb-surface to-wb-accent-soft flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            {/* Error Modal */}
            {(error || missingDetailsError) && (
                <div className="fixed inset-0 flex items-center justify-center z-50">
                    <div className="fixed inset-0 bg-wb-text bg-opacity-50 transition-opacity" onClick={() => setError('')}></div>
                    <div className="relative bg-wb-surface rounded-lg max-w-md w-full p-6 shadow-xl transform transition-all">
                        <div className="flex items-center">
                            <FaExclamationCircle className="h-6 w-6 text-wb-danger mr-3" />
                            <h3 className="text-lg font-medium text-wb-text">Error</h3>
                        </div>
                        <p className="mt-2 text-sm text-wb-muted">{error || missingDetailsError}</p>
                        <button
                            onClick={() => {
                                setError('');
                                setMissingDetailsError('');
                            }}
                            className="mt-4 w-full inline-flex justify-center rounded-md border border-transparent px-4 py-2 bg-wb-danger text-base font-medium text-white hover:bg-wb-danger-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-wb-danger sm:text-sm"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="mt-6 text-center text-3xl font-extrabold text-wb-text">
                    Create Your Account
                </h2>
                <p className="mt-2 text-center text-sm text-wb-muted">
                    Join our community and start your journey to better mental health
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-wb-surface py-8 px-4 shadow-xl rounded-lg sm:px-10">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        {/* Profile Picture Upload */}
                        <div className="relative group">
                            {/* The whole dashed box is the label, so a click anywhere opens the picker. */}
                            <label
                                htmlFor="profilePicture"
                                data-testid="profile-picture-dropzone"
                                className="relative flex items-center justify-center w-full min-h-[8rem] py-3 border-2 border-dashed border-wb-border rounded-lg hover:border-wb-primary transition-colors cursor-pointer focus-within:ring-2 focus-within:ring-wb-primary focus-within:ring-offset-2"
                            >
                                <span className="block text-center">
                                    {previewUrl ? (
                                        <span className="relative mx-auto block h-20 w-20">
                                            <img
                                                src={previewUrl}
                                                alt="Your profile preview"
                                                className="h-20 w-20 rounded-full object-cover border border-wb-border"
                                            />
                                            {isProcessingImage && (
                                                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-wb-surface bg-opacity-60">
                                                    <FaSpinner className="h-5 w-5 animate-spin text-wb-primary" aria-hidden="true" />
                                                </span>
                                            )}
                                        </span>
                                    ) : (
                                        <FaImage className="mx-auto h-8 w-8 text-wb-muted group-hover:text-wb-primary transition-colors" aria-hidden="true" />
                                    )}
                                    <span id="profilePictureTitle" className="mt-2 block text-sm font-medium text-wb-muted group-hover:text-wb-primary">
                                        {previewUrl ? 'Change Profile Picture' : 'Upload Profile Picture'}
                                    </span>
                                    <span id="profilePictureHint" className="mt-1 block text-xs text-wb-muted" aria-live="polite">
                                        {isProcessingImage ? 'Preparing image...' : 'JPG, PNG or WebP, up to 15 MB (optional)'}
                                    </span>
                                </span>
                                {/* Visually hidden but still focusable, so keyboard users can open the picker. */}
                                <input
                                    id="profilePicture"
                                    type="file"
                                    className="sr-only"
                                    onChange={handleFileChange}
                                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                    disabled={isSubmitting}
                                    aria-labelledby="profilePictureTitle"
                                    aria-describedby="profilePictureHint"
                                    data-testid="profile-picture-input"
                                />
                            </label>
                            {/* Kept outside the label so removing never reopens the picker. */}
                            {previewUrl && !isSubmitting && (
                                <div className="mt-2 text-center">
                                    <button
                                        type="button"
                                        onClick={clearPicture}
                                        className="text-xs font-medium text-wb-muted underline hover:text-wb-primary"
                                    >
                                        Remove picture
                                    </button>
                                </div>
                            )}
                            {imageError && (
                                <p role="alert" className="mt-2 flex items-center text-sm text-wb-danger">
                                    <FaExclamationCircle className="mr-2 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                                    {imageError}
                                </p>
                            )}
                        </div>

                        {/* Username */}
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-wb-muted">
                                Username <span className="text-wb-danger">*</span>
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <FaUser className="h-5 w-5 text-wb-muted" />
                                </div>
                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    required
                                    value={formData.username}
                                    onChange={handleChange}
                                    className="block w-full pl-10 pr-3 py-3 border border-wb-control rounded-md focus:outline-none focus:ring-2 focus:ring-wb-primary focus:border-transparent sm:text-sm"
                                    placeholder="Choose a username"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-wb-muted">
                                Password <span className="text-wb-danger">*</span>
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <FaLock className="h-5 w-5 text-wb-muted" />
                                </div>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    value={formData.password}
                                    onChange={handleChange}
                                    className="block w-full pl-10 pr-3 py-3 border border-wb-control rounded-md focus:outline-none focus:ring-2 focus:ring-wb-primary focus:border-transparent sm:text-sm"
                                    placeholder="Create a strong password"
                                />
                            </div>
                        </div>

                        {/* Name */}
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-wb-muted">
                                Full Name <span className="text-wb-danger">*</span>
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <FaUserCircle className="h-5 w-5 text-wb-muted" />
                                </div>
                                <input
                                    id="name"
                                    name="name"
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={handleChange}
                                    className="block w-full pl-10 pr-3 py-3 border border-wb-control rounded-md focus:outline-none focus:ring-2 focus:ring-wb-primary focus:border-transparent sm:text-sm"
                                    placeholder="Enter your full name"
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-wb-muted">
                                Email <span className="text-wb-danger">*</span>
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <FaEnvelope className="h-5 w-5 text-wb-muted" />
                                </div>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="block w-full pl-10 pr-3 py-3 border border-wb-control rounded-md focus:outline-none focus:ring-2 focus:ring-wb-primary focus:border-transparent sm:text-sm"
                                    placeholder="Enter your email"
                                />
                            </div>
                        </div>

                        {/* Gender and Age Row */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="gender" className="block text-sm font-medium text-wb-muted">
                                    Gender <span className="text-wb-danger">*</span>
                                </label>
                                <select
                                    id="gender"
                                    name="gender"
                                    required
                                    value={formData.gender}
                                    onChange={handleChange}
                                    className="mt-1 block w-full py-3 px-3 border border-wb-control rounded-md focus:outline-none focus:ring-2 focus:ring-wb-primary focus:border-transparent sm:text-sm"
                                >
                                    <option value="">Select Gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Non Binary">Non Binary</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="age" className="block text-sm font-medium text-wb-muted">
                                    Age <span className="text-wb-danger">*</span>
                                </label>
                                <input
                                    id="age"
                                    name="age"
                                    type="number"
                                    required
                                    value={formData.age}
                                    onChange={handleChange}
                                    className="mt-1 block w-full py-3 px-3 border border-wb-control rounded-md focus:outline-none focus:ring-2 focus:ring-wb-primary focus:border-transparent sm:text-sm"
                                    placeholder="Your age"
                                />
                            </div>
                        </div>

                        {/* Bio */}
                        <div>
                            <label htmlFor="bio" className="block text-sm font-medium text-wb-muted">
                                Bio
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute top-3 left-3 pointer-events-none">
                                    <FaInfoCircle className="h-5 w-5 text-wb-muted" />
                                </div>
                                <textarea
                                    id="bio"
                                    name="bio"
                                    rows="3"
                                    value={formData.bio}
                                    onChange={handleChange}
                                    className="block w-full pl-10 pr-3 py-3 border border-wb-control rounded-md focus:outline-none focus:ring-2 focus:ring-wb-primary focus:border-transparent sm:text-sm"
                                    placeholder="Tell us about yourself..."
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={isSubmitting || isProcessingImage}
                                aria-busy={isSubmitting}
                                className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-wb-primary hover:bg-wb-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-wb-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isSubmitting && <FaSpinner className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                                {isSubmitting ? 'Creating account...' : isProcessingImage ? 'Preparing image...' : 'Create Account'}
                            </button>
                        </div>
                    </form>

                    <div className="mt-6">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-wb-border"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-wb-surface text-wb-muted">Already have an account?</span>
                            </div>
                        </div>

                        <div className="mt-6">
                            <a
                                href="/login"
                                className="wb-hover-btn w-full inline-flex justify-center py-3 px-4 rounded-md shadow-sm bg-wb-surface text-sm font-medium text-wb-muted border border-wb-border hover:bg-wb-subtle focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-wb-primary transition-colors"
                            >
                                Sign in instead
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Signup;

