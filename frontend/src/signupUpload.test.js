// Offline tests for the Sign Up profile-picture flow: validation, Canvas
// compression, preview URLs, loading state, duplicate-submit protection and
// error messages. window.fetch, Image, canvas and object URLs are mocked, so no
// request leaves the test process. Only synthetic data is used.
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Signup, {
    validateImageFile,
    fitWithin,
    compressImage,
    MAX_ORIGINAL_IMAGE_BYTES,
    MAX_UPLOAD_IMAGE_BYTES,
} from './compnents/SignupIn/Signup';

const originalFetch = window.fetch;
const originalImage = global.Image;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToBlob = HTMLCanvasElement.prototype.toBlob;

// Controls for the mocked browser image pipeline.
let imageSize;
let imageFails;
let encodedSize;
let canvasCalls;
let urlCounter;
let revokedUrls;

class MockImage {
    set src(value) {
        this._src = value;
        setTimeout(() => {
            if (imageFails) { this.onerror && this.onerror(new Event('error')); return; }
            this.naturalWidth = imageSize.width;
            this.naturalHeight = imageSize.height;
            this.onload && this.onload();
        }, 0);
    }
    get src() { return this._src; }
}

const makeFile = (name, type, size = 2048) => {
    const file = new File([new Uint8Array(16)], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    return file;
};

beforeEach(() => {
    imageSize = { width: 4000, height: 3000 };
    imageFails = false;
    encodedSize = 250 * 1024;
    canvasCalls = [];
    urlCounter = 0;
    revokedUrls = [];
    global.Image = MockImage;
    URL.createObjectURL = jest.fn(() => `blob:synthetic-${(urlCounter += 1)}`);
    URL.revokeObjectURL = jest.fn((url) => revokedUrls.push(url));
    HTMLCanvasElement.prototype.getContext = function getContext() {
        return { fillStyle: '', fillRect: jest.fn(), drawImage: jest.fn() };
    };
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type, quality) {
        canvasCalls.push({ width: this.width, height: this.height, type, quality });
        const blob = new Blob([new Uint8Array(8)], { type });
        Object.defineProperty(blob, 'size', { value: encodedSize });
        callback(blob);
    };
    window.fetch = jest.fn();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    window.fetch = originalFetch;
    global.Image = originalImage;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
    jest.useRealTimers();
    jest.restoreAllMocks();
});

const renderSignup = () => render(
    <MemoryRouter initialEntries={['/signup']}>
        <Routes>
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<div>login page</div>} />
        </Routes>
    </MemoryRouter>
);

const fillRequiredFields = () => {
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'synthetic_user' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'synthetic-pass-123' } });
    fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: 'Synthetic Person' } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'synthetic@example.test' } });
    fireEvent.change(screen.getByLabelText(/Gender/), { target: { value: 'Female' } });
    fireEvent.change(screen.getByLabelText(/Age/), { target: { value: '30' } });
};

const choosePicture = (file) => fireEvent.change(screen.getByTestId('profile-picture-input'), { target: { files: [file] } });
const submitButton = () => screen.getByRole('button', { name: /Create Account|Creating account|Preparing image/i });
const sentFormData = () => window.fetch.mock.calls[0][1].body;
const okResponse = () => ({ ok: true, status: 200, json: async () => ({ username: 'synthetic_user' }) });

describe('image validation helpers', () => {
    test('accepts JPG, JPEG, PNG and WebP up to 15 MB', () => {
        expect(validateImageFile(makeFile('a.jpg', 'image/jpeg'))).toBe('');
        expect(validateImageFile(makeFile('a.jpeg', 'image/jpeg'))).toBe('');
        expect(validateImageFile(makeFile('a.png', 'image/png'))).toBe('');
        expect(validateImageFile(makeFile('a.webp', 'image/webp'))).toBe('');
        expect(validateImageFile(makeFile('a.jpg', 'image/jpeg', MAX_ORIGINAL_IMAGE_BYTES))).toBe('');
        // Some systems report no MIME type; the extension is used then.
        expect(validateImageFile(makeFile('a.JPEG', ''))).toBe('');
    });

    test('rejects other formats, empty files and files over 15 MB', () => {
        expect(validateImageFile(makeFile('a.gif', 'image/gif'))).toMatch(/JPG, PNG or WebP/);
        expect(validateImageFile(makeFile('a.heic', 'image/heic'))).toMatch(/JPG, PNG or WebP/);
        expect(validateImageFile(makeFile('a.pdf', 'application/pdf'))).toMatch(/JPG, PNG or WebP/);
        expect(validateImageFile(makeFile('a.heic', ''))).toMatch(/JPG, PNG or WebP/);
        expect(validateImageFile(makeFile('a.jpg', 'image/jpeg', MAX_ORIGINAL_IMAGE_BYTES + 1))).toMatch(/15 MB/);
        expect(validateImageFile(makeFile('a.jpg', 'image/jpeg', 0))).toMatch(/empty/);
    });

    test('fitWithin keeps the aspect ratio inside 1024 x 1024 and never enlarges', () => {
        expect(fitWithin(4000, 3000)).toEqual({ width: 1024, height: 768 });
        expect(fitWithin(3000, 6000)).toEqual({ width: 512, height: 1024 });
        expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    });
});

describe('compressImage (Canvas API)', () => {
    test('a large photo is resized to 1024 px and encoded as JPEG at 0.85', async () => {
        const result = await compressImage(makeFile('holiday.png', 'image/png', 9 * 1024 * 1024));
        expect(canvasCalls[0]).toEqual({ width: 1024, height: 768, type: 'image/jpeg', quality: 0.85 });
        expect(result.name).toBe('holiday.jpg');
        expect(result.blob.size).toBeLessThanOrEqual(MAX_UPLOAD_IMAGE_BYTES);
        expect(revokedUrls).toContain('blob:synthetic-1');
    });

    test('a small image that re-encoding would not shrink is kept as it is', async () => {
        imageSize = { width: 300, height: 300 };
        const original = makeFile('small.png', 'image/png', 20 * 1024);
        const result = await compressImage(original);
        expect(result.blob).toBe(original);
        expect(result.name).toBe('small.png');
    });

    test('lower qualities are tried, and an error is raised if the result stays over 5 MB', async () => {
        encodedSize = MAX_UPLOAD_IMAGE_BYTES + 1;
        await expect(compressImage(makeFile('huge.jpg', 'image/jpeg', 14 * 1024 * 1024))).rejects.toThrow('too-large');
        expect(canvasCalls.map((c) => c.quality)).toEqual([0.85, 0.7, 0.55]);
    });

    test('an image the browser cannot decode raises an error', async () => {
        imageFails = true;
        await expect(compressImage(makeFile('broken.jpg', 'image/jpeg'))).rejects.toThrow('decode');
    });
});

describe('Sign Up page', () => {
    test('signup without a profile picture still works and sends no file', async () => {
        window.fetch.mockResolvedValue(okResponse());
        renderSignup();
        fillRequiredFields();
        fireEvent.click(submitButton());
        expect(await screen.findByText('login page')).toBeTruthy();
        expect(window.fetch).toHaveBeenCalledTimes(1);
        const body = sentFormData();
        expect(body.get('username')).toBe('synthetic_user');
        expect(body.get('profilePicture')).toBeNull();
    });

    test('selecting a picture shows a preview at once and uploads the compressed JPEG', async () => {
        window.fetch.mockResolvedValue(okResponse());
        renderSignup();
        fillRequiredFields();
        choosePicture(makeFile('portrait.jpg', 'image/jpeg', 8 * 1024 * 1024));

        const preview = screen.getByAltText('Your profile preview');
        expect(preview.getAttribute('src')).toBe('blob:synthetic-1');
        expect(submitButton().textContent).toBe('Preparing image...');
        await waitFor(() => expect(submitButton().textContent).toBe('Create Account'));

        fireEvent.click(submitButton());
        expect(await screen.findByText('login page')).toBeTruthy();
        const file = sentFormData().get('profilePicture');
        expect(file.name).toBe('portrait.jpg');
        expect(file.type).toBe('image/jpeg');
        expect(canvasCalls[0]).toEqual(expect.objectContaining({ width: 1024, height: 768 }));
    });

    test('choosing another picture replaces the preview and releases the old URL', async () => {
        renderSignup();
        choosePicture(makeFile('first.jpg', 'image/jpeg'));
        await waitFor(() => expect(submitButton().textContent).toBe('Create Account'));
        const firstPreview = screen.getByAltText('Your profile preview').getAttribute('src');

        choosePicture(makeFile('second.png', 'image/png'));
        await waitFor(() => expect(submitButton().textContent).toBe('Create Account'));
        const secondPreview = screen.getByAltText('Your profile preview').getAttribute('src');
        expect(secondPreview).not.toBe(firstPreview);
        expect(revokedUrls).toContain(firstPreview);

        fireEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
        expect(screen.queryByAltText('Your profile preview')).toBeNull();
        expect(revokedUrls).toContain(secondPreview);
    });

    test('an unsupported format is rejected immediately with a clear message', () => {
        renderSignup();
        choosePicture(makeFile('photo.heic', 'image/heic'));
        expect(screen.getByRole('alert').textContent).toMatch(/Please choose a JPG, PNG or WebP image/);
        expect(screen.queryByAltText('Your profile preview')).toBeNull();
        expect(canvasCalls).toEqual([]);
    });

    test('an image over 15 MB is rejected immediately with a clear message', () => {
        renderSignup();
        choosePicture(makeFile('big.jpg', 'image/jpeg', MAX_ORIGINAL_IMAGE_BYTES + 1));
        expect(screen.getByRole('alert').textContent).toMatch(/larger than 15 MB/);
        expect(screen.queryByAltText('Your profile preview')).toBeNull();
    });

    test('a compression failure shows a message and the account can still be created without a picture', async () => {
        imageFails = true;
        window.fetch.mockResolvedValue(okResponse());
        renderSignup();
        fillRequiredFields();
        choosePicture(makeFile('broken.jpg', 'image/jpeg'));
        expect((await screen.findByRole('alert')).textContent).toMatch(/could not process this image/);
        expect(screen.queryByAltText('Your profile preview')).toBeNull();

        fireEvent.click(submitButton());
        expect(await screen.findByText('login page')).toBeTruthy();
        expect(sentFormData().get('profilePicture')).toBeNull();
    });

    test('duplicate submissions are prevented while the request is in flight', async () => {
        let resolveFetch;
        window.fetch.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));
        renderSignup();
        fillRequiredFields();

        const form = submitButton().closest('form');
        fireEvent.click(submitButton());
        fireEvent.submit(form);
        fireEvent.submit(form);

        expect(window.fetch).toHaveBeenCalledTimes(1);
        expect(submitButton().disabled).toBe(true);
        expect(submitButton().textContent).toBe('Creating account...');
        expect(submitButton().getAttribute('aria-busy')).toBe('true');

        await act(async () => resolveFetch(okResponse()));
        expect(await screen.findByText('login page')).toBeTruthy();
        expect(window.fetch).toHaveBeenCalledTimes(1);
    });

    test('server errors are shown and the button is re-enabled', async () => {
        window.fetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ msg: 'Username or email already exists!' }) });
        renderSignup();
        fillRequiredFields();
        fireEvent.click(submitButton());
        expect(await screen.findByText('Username or email already exists!')).toBeTruthy();
        expect(submitButton().disabled).toBe(false);
        expect(submitButton().textContent).toBe('Create Account');
    });

    test('a server error without a JSON body still shows a useful message', async () => {
        window.fetch.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
        renderSignup();
        fillRequiredFields();
        fireEvent.click(submitButton());
        expect(await screen.findByText(/Sign up failed \(error 502\)/)).toBeTruthy();
    });

    test('a network failure shows a connection message instead of failing silently', async () => {
        window.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
        renderSignup();
        fillRequiredFields();
        fireEvent.click(submitButton());
        expect(await screen.findByText(/could not reach the server/)).toBeTruthy();
        expect(submitButton().disabled).toBe(false);
    });

    test('the file input is labelled, described and reachable by keyboard', () => {
        renderSignup();
        const input = screen.getByTestId('profile-picture-input');
        expect(screen.getByLabelText('Upload Profile Picture')).toBe(input);
        expect(screen.getByTestId('profile-picture-dropzone').getAttribute('for')).toBe(input.id);
        expect(input.getAttribute('aria-describedby')).toBe('profilePictureHint');
        expect(input.className).not.toMatch(/\bhidden\b/); // display:none would remove it from the tab order
        input.focus();
        expect(document.activeElement).toBe(input);
    });

    test('clicking the centre, edges, icon and helper text of the box opens the file picker', () => {
        renderSignup();
        const input = screen.getByTestId('profile-picture-input');
        const pickerOpens = jest.fn();
        input.addEventListener('click', pickerOpens);
        const dropzone = screen.getByTestId('profile-picture-dropzone');

        fireEvent.click(dropzone); // edge / padding of the dashed box
        fireEvent.click(screen.getByText('Upload Profile Picture')); // centre text
        fireEvent.click(dropzone.querySelector('svg')); // centre icon
        fireEvent.click(screen.getByText(/up to 15 MB/)); // helper text
        expect(pickerOpens).toHaveBeenCalledTimes(4);
    });

    test('clicking the preview opens the picker, a new image replaces it, and Remove does not open the picker', async () => {
        renderSignup();
        const input = screen.getByTestId('profile-picture-input');
        const pickerOpens = jest.fn();
        input.addEventListener('click', pickerOpens);

        choosePicture(makeFile('first.jpg', 'image/jpeg'));
        await waitFor(() => expect(submitButton().textContent).toBe('Create Account'));
        const firstPreview = screen.getByAltText('Your profile preview').getAttribute('src');
        fireEvent.click(screen.getByAltText('Your profile preview'));
        fireEvent.click(screen.getByText('Change Profile Picture'));
        expect(pickerOpens).toHaveBeenCalledTimes(2);

        choosePicture(makeFile('second.webp', 'image/webp'));
        await waitFor(() => expect(submitButton().textContent).toBe('Create Account'));
        expect(screen.getByAltText('Your profile preview').getAttribute('src')).not.toBe(firstPreview);

        fireEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
        expect(pickerOpens).toHaveBeenCalledTimes(2);
        expect(screen.queryByAltText('Your profile preview')).toBeNull();
        expect(screen.getByText('Upload Profile Picture')).toBeTruthy();
    });

    test('a request still running after 60 seconds is aborted with a timeout message', async () => {
        jest.useFakeTimers();
        window.fetch.mockImplementation((url, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => {
                const abortError = new Error('The operation was aborted.');
                abortError.name = 'AbortError';
                reject(abortError);
            });
        }));
        renderSignup();
        fillRequiredFields();
        fireEvent.click(submitButton());

        await act(async () => { jest.advanceTimersByTime(59 * 1000); });
        expect(screen.queryByText(/taking too long/)).toBeNull();
        await act(async () => { jest.advanceTimersByTime(1000); });
        expect(screen.getByText(/taking too long/)).toBeTruthy();
        expect(submitButton().disabled).toBe(false);
    });
});
