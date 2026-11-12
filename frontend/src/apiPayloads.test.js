// Offline contract test for the journal-update and profile-update request payloads.
// All axios traffic goes to a mock adapter and window.fetch is mocked, so no
// request ever leaves the test process. Only synthetic data is used.
import React from 'react';
import axios from 'axios';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import UpdateJournal from './compnents/journal/Updatejournal';
import ProfileUpdate from './compnents/profile/ProfileUpdate';

const originalAdapter = axios.defaults.adapter;
const originalFetch = window.fetch;
let sentRequests;

const syntheticJournal = {
  _id: 'journal-test-id',
  title: 'Synthetic title',
  article: 'Synthetic journal body',
  tags: ['old-tag'],
  coverPicture: 'upload1/existing-cover.png',
};

const syntheticUser = {
  username: 'testuser',
  name: 'Test User',
  email: 'test.user@example.com',
  gender: 'Female',
  age: 30,
  bio: 'Synthetic bio',
  profilePicture: 'uploads/existing-profile.png',
};

// Mock adapter: receives the request after axios has serialized it, records it,
// and answers locally. Any unexpected request fails the test.
const mockAdapter = async (config) => {
  sentRequests.push(config);
  const reply = (data) => ({ data, status: 200, statusText: 'OK', headers: {}, config, request: {} });
  if (config.method === 'get' && config.url.endsWith('/testuser/journal-test-id')) {
    return reply(syntheticJournal);
  }
  if (config.method === 'put' || config.method === 'patch') {
    return reply({ ok: true });
  }
  throw new Error(`Unexpected request in offline test: ${config.method} ${config.url}`);
};

beforeEach(() => {
  sentRequests = [];
  axios.defaults.adapter = mockAdapter;
  window.fetch = jest.fn(async (url, options) => {
    if (String(url).endsWith('/testuser/getuserdetails')) {
      // The profile request must send the session cookie.
      expect(options).toEqual(expect.objectContaining({ credentials: 'include' }));
      return { status: 200, ok: true, json: async () => syntheticUser };
    }
    throw new Error(`Unexpected fetch in offline test: ${url}`);
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  window.fetch = originalFetch;
  jest.restoreAllMocks();
});

const findRequest = (method) => sentRequests.find((r) => r.method === method);

// A File (or any non-array object) must never appear as a JSON value.
const hasOnlyJsonPrimitivesOrArrays = (body) =>
  Object.values(body).every((v) => v === null || typeof v !== 'object' || Array.isArray(v));

const renderJournalEdit = () =>
  render(
    <MemoryRouter initialEntries={['/testuser/journals/journal-test-id/edit']}>
      <Routes>
        <Route path="/:username/journals/:id/edit" element={<UpdateJournal />} />
        <Route path="/:username/profile" element={<div>profile page</div>} />
      </Routes>
    </MemoryRouter>
  );

const renderProfileEdit = () =>
  render(
    <MemoryRouter initialEntries={['/testuser/updateprofile']}>
      <Routes>
        <Route path="/:username/updateprofile" element={<ProfileUpdate />} />
        <Route path="/:username/profile" element={<div>profile page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('UpdateJournal PUT payload', () => {
  const submitWithTags = async (tagsInput) => {
    renderJournalEdit();
    await waitFor(() => expect(screen.getByLabelText('Title').value).toBe('Synthetic title'));
    fireEvent.change(screen.getByLabelText('Tags'), { target: { name: 'tags', value: tagsInput } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(findRequest('put')).toBeDefined());
    return findRequest('put');
  };

  test('sends tags as a trimmed array and omits coverPicture', async () => {
    const request = await submitWithTags('  calm , focus ,, sleep  ');

    expect(request.url).toBe('http://localhost:8000/journals/testuser/journal-test-id');
    expect(request.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(typeof request.data).toBe('string');

    const body = JSON.parse(request.data);
    expect(Object.keys(body).sort()).toEqual(['article', 'tags', 'title']);
    expect(body.tags).toEqual(['calm', 'focus', 'sleep']);
    expect(body).not.toHaveProperty('coverPicture');
    expect(hasOnlyJsonPrimitivesOrArrays(body)).toBe(true);
    await waitFor(() => expect(screen.getByText('profile page')).toBeTruthy());
  });

  test('sends an empty array when tags are cleared', async () => {
    const request = await submitWithTags('');
    expect(JSON.parse(request.data).tags).toEqual([]);
  });

  test('keeps the existing tags when the field is not edited', async () => {
    renderJournalEdit();
    await waitFor(() => expect(screen.getByLabelText('Tags').value).toBe('old-tag'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(findRequest('put')).toBeDefined());
    expect(JSON.parse(findRequest('put').data).tags).toEqual(['old-tag']);
  });
});

describe('ProfileUpdate PATCH payload', () => {
  const loadForm = async () => {
    renderProfileEdit();
    await waitFor(() => expect(screen.getByLabelText('Name').value).toBe('Test User'));
  };

  test('sends supported text fields as JSON without profilePicture or password', async () => {
    await loadForm();
    fireEvent.change(screen.getByLabelText('Bio'), { target: { name: 'bio', value: 'Updated synthetic bio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(findRequest('patch')).toBeDefined());
    const request = findRequest('patch');

    expect(request.url).toBe('http://localhost:8000/testuser/update-user');
    expect(request.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(typeof request.data).toBe('string');

    const body = JSON.parse(request.data);
    expect(Object.keys(body).sort()).toEqual(['age', 'bio', 'email', 'gender', 'name']);
    expect(body).toMatchObject({
      name: 'Test User',
      email: 'test.user@example.com',
      gender: 'Female',
      bio: 'Updated synthetic bio',
    });
    expect(String(body.age)).toBe('30');
    expect(body).not.toHaveProperty('profilePicture');
    expect(body).not.toHaveProperty('password');
    expect(hasOnlyJsonPrimitivesOrArrays(body)).toBe(true);
    await waitFor(() => expect(screen.getByText('profile page')).toBeTruthy());
  });

  test('includes password and current password only when a new one is entered', async () => {
    await loadForm();
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { name: 'newPassword', value: 'synthetic-test-value' },
    });
    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { name: 'currentPassword', value: 'synthetic-current-value' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(findRequest('patch')).toBeDefined());

    const body = JSON.parse(findRequest('patch').data);
    expect(body.password).toBe('synthetic-test-value');
    expect(body.currentPassword).toBe('synthetic-current-value');
    expect(body).not.toHaveProperty('profilePicture');
  });

  test('does not send a new password without the current password', async () => {
    await loadForm();
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { name: 'newPassword', value: 'synthetic-test-value' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Enter your current password to set a new one')).toBeTruthy());
    expect(findRequest('patch')).toBeUndefined();
  });

  test('shows a specific message when the current password is wrong', async () => {
    axios.defaults.adapter = async (config) => {
      sentRequests.push(config);
      const error = new Error('Request failed with status code 403');
      error.config = config;
      error.response = { status: 403, data: { msg: 'Current password is incorrect.' }, headers: {}, config };
      throw error;
    };
    await loadForm();
    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { name: 'newPassword', value: 'synthetic-test-value' },
    });
    fireEvent.change(screen.getByLabelText('Current Password'), {
      target: { name: 'currentPassword', value: 'synthetic-wrong-value' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Current password is incorrect')).toBeTruthy());
  });

  test('shows the error message when the update fails', async () => {
    axios.defaults.adapter = async (config) => {
      sentRequests.push(config);
      const error = new Error('Request failed with status code 400');
      error.config = config;
      error.response = { status: 400, data: { msg: 'Invalid updates!' }, headers: {}, config };
      throw error;
    };
    await loadForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Failed to update profile')).toBeTruthy());
  });
});
