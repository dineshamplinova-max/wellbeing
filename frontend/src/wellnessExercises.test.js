// Offline tests for the Wellness Exercises section on the Meditation page.
// All axios traffic goes to a mock adapter, so no request ever leaves the test
// process. No user data is used.
import '@testing-library/jest-dom';
import React from 'react';
import axios from 'axios';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellnessExercises, { trapFocusTarget } from './compnents/meditation/WellnessExercises.jsx';
import MeditationTracker from './compnents/meditation/MeditationTracker.jsx';
import * as exerciseData from './compnents/meditation/exerciseData.js';
import {
  CATEGORIES, DIFFICULTIES, EXERCISES, GENERAL_NOTICE, STOP_NOTE,
} from './compnents/meditation/exerciseData.js';

const SESSIONS_URL = 'http://localhost:8000/api/meditation/sessions/testuser';
const originalAdapter = axios.defaults.adapter;
let requests;

beforeEach(() => {
  requests = [];
  localStorage.setItem('tokenUser', 'testuser');
  axios.defaults.adapter = async (config) => {
    requests.push(config);
    if (config.method === 'get' && config.url === SESSIONS_URL) {
      return { data: [], status: 200, statusText: 'OK', headers: {}, config, request: {} };
    }
    throw new Error(`Unexpected request in offline test: ${config.method} ${config.url}`);
  };
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  localStorage.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// The nine approved, licence-checked Pexels photos and their photographers.
const APPROVED_PHOTOS = {
  'neck-side-stretch': 'Miriam Alonso',
  'wall-calf-stretch': 'Ketut Subiyanto',
  'childs-pose': 'Mikhail Nilov',
  'cat-cow': 'KoolShooters',
  'box-breathing': 'Katrin Bolovtsova',
  'belly-breathing': 'Anna Tarazevich',
  'easy-walk': 'SHVETS production',
  'progressive-muscle-relaxation': 'Kaboompics',
  'senses-pause': 'Tiana',
};
// No accurate photo was found for these, so they keep the placeholder.
const PLACEHOLDER_IDS = ['marching-on-the-spot', 'shoulder-rolls', 'seated-chin-tuck'];
const byId = (id) => EXERCISES.find((e) => e.id === id);

const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const cards = () => within(screen.getByRole('list', { name: 'Exercises' })).queryAllByRole('listitem');
const cardNames = () => cards().map((card) => within(card).getByRole('heading', { level: 3 }).textContent);
const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id).label;

describe('exercise data', () => {
  test('loads from the renamed exerciseData.js module and the section renders it', () => {
    expect(Object.keys(exerciseData).sort()).toEqual(['CATEGORIES', 'DIFFICULTIES', 'EXERCISES', 'GENERAL_NOTICE', 'STOP_NOTE']);
    render(<WellnessExercises />);
    expect(cardNames()).toEqual(exerciseData.EXERCISES.map((e) => e.name));
  });

  test('has the 6 categories and 12 exercises, 2 per category, with unique ids', () => {
    expect(CATEGORIES.map((c) => c.label)).toEqual([
      'Stretching', 'Yoga', 'Breathing Exercises', 'Physical Activity', 'Posture and Desk Relief', 'Relaxation',
    ]);
    expect(EXERCISES).toHaveLength(12);
    CATEGORIES.forEach(({ id }) => {
      expect(EXERCISES.filter((e) => e.category === id)).toHaveLength(2);
    });
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(12);
  });

  test('every exercise has all card and guide fields', () => {
    EXERCISES.forEach((e) => {
      ['id', 'name', 'description', 'introduction', 'guidance', 'imageAlt'].forEach((field) => {
        expect(nonEmptyString(e[field])).toBe(true);
      });
      expect(CATEGORIES.map((c) => c.id)).toContain(e.category);
      expect(e).toHaveProperty('image');
      expect(Array.isArray(e.equipment) && e.equipment.length > 0 && e.equipment.every(nonEmptyString)).toBe(true);
    });
  });

  test('durations are positive and difficulty values are valid', () => {
    EXERCISES.forEach((e) => {
      expect(Number.isInteger(e.durationMinutes) && e.durationMinutes > 0).toBe(true);
      expect(DIFFICULTIES).toContain(e.difficulty);
    });
  });

  test('every exercise has step instructions with image alt text, and safety notes', () => {
    EXERCISES.forEach((e) => {
      expect(e.steps.length).toBeGreaterThanOrEqual(3);
      e.steps.forEach((step) => {
        expect(nonEmptyString(step.text)).toBe(true);
        expect(nonEmptyString(step.imageAlt)).toBe(true);
        expect(step).toHaveProperty('image');
      });
      expect(e.safety.length).toBeGreaterThan(0);
      expect(e.safety.every(nonEmptyString)).toBe(true);
      expect(e.safety).toContain(STOP_NOTE);
    });
    expect(STOP_NOTE).toMatch(/pain, dizziness or discomfort/);
    expect(GENERAL_NOTICE).toMatch(/not medical advice/);
    expect(GENERAL_NOTICE).toMatch(/pain, dizziness or discomfort/);
  });

  test('no external image URLs and no treatment or cure claims', () => {
    const images = EXERCISES.flatMap((e) => [e.image, ...e.steps.map((s) => s.image)]);
    images.forEach((image) => {
      expect(image === null || (typeof image === 'string' && !/^([a-z]+:)?\/\//i.test(image) && !image.startsWith('data:'))).toBe(true);
    });
    // The only web addresses allowed are the photo credit links to the original Pexels pages.
    const withoutCredits = EXERCISES.map(({ credit, ...rest }) => rest);
    const allText = JSON.stringify({ CATEGORIES, EXERCISES: withoutCredits, GENERAL_NOTICE });
    expect(allText).not.toMatch(/https?:\/\//i);
    expect(JSON.stringify(EXERCISES)).not.toMatch(/\b(cure[sd]?|treat(s|ment)?|heal(s|ing)?|diagnos\w*|therap\w*|guarantee\w*)\b/i);
  });

  test('exactly the nine approved exercises have a local photo and a Pexels credit', () => {
    Object.entries(APPROVED_PHOTOS).forEach(([id, photographer]) => {
      const e = byId(id);
      expect(e.image).toMatch(/\.jpg$/);
      expect(e.credit).toEqual({ photographer, source: 'Pexels', url: expect.stringMatching(/^https:\/\/www\.pexels\.com\/photo\/[a-z0-9-]+-\d+\/$/) });
    });
    PLACEHOLDER_IDS.forEach((id) => {
      expect(byId(id).image).toBeNull();
      expect(byId(id).credit).toBeUndefined();
    });
    expect(Object.keys(APPROVED_PHOTOS).length + PLACEHOLDER_IDS.length).toBe(EXERCISES.length);
    // Step images stay empty; each exercise has one photo at most.
    EXERCISES.forEach((e) => e.steps.forEach((s) => expect(s.image).toBeNull()));
  });
});

describe('Wellness Exercises section', () => {
  test('All is selected by default and shows every exercise card with its content', () => {
    render(<WellnessExercises />);
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(GENERAL_NOTICE)).toBeInTheDocument();
    expect(cards()).toHaveLength(12);
    expect(screen.getAllByTestId('exercise-image-placeholder')).toHaveLength(3);

    const cardFor = (exercise) => within(cards()[EXERCISES.indexOf(exercise)]);
    EXERCISES.filter((e) => e.image).forEach((exercise) => {
      expect(cardFor(exercise).getByRole('img', { name: exercise.imageAlt })).toHaveAttribute('src', exercise.image);
      expect(cardFor(exercise).queryByTestId('exercise-image-placeholder')).toBeNull();
    });
    EXERCISES.filter((e) => !e.image).forEach((exercise) => {
      expect(cardFor(exercise).getByTestId('exercise-image-placeholder')).toBeInTheDocument();
      expect(cardFor(exercise).queryByRole('img')).toBeNull();
    });

    EXERCISES.forEach((exercise, index) => {
      const card = within(cards()[index]);
      expect(card.getByRole('heading', { level: 3, name: exercise.name })).toBeInTheDocument();
      expect(card.getByText(categoryLabel(exercise.category))).toBeInTheDocument();
      expect(card.getByText(exercise.description)).toBeInTheDocument();
      expect(card.getByText(`About ${exercise.durationMinutes} min`)).toBeInTheDocument();
      expect(card.getByText(exercise.difficulty)).toBeInTheDocument();
      expect(card.getByRole('button', { name: `View guide: ${exercise.name}` })).toHaveAttribute('type', 'button');
    });
  });

  test('every category filter shows only its exercises, and All shows them again', () => {
    render(<WellnessExercises />);
    CATEGORIES.forEach(({ id, label }) => {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
      expect(cardNames()).toEqual(EXERCISES.filter((e) => e.category === id).map((e) => e.name));
    });
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(cards()).toHaveLength(12);
  });

  test('View guide opens the correct, labelled guide with steps in order', () => {
    render(<WellnessExercises />);
    EXERCISES.forEach((exercise) => {
      fireEvent.click(screen.getByRole('button', { name: `View guide: ${exercise.name}` }));
      const dialog = screen.getByRole('dialog', { name: exercise.name });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(within(dialog).getByRole('heading', { level: 2, name: exercise.name })).toHaveFocus();

      const guide = within(dialog);
      expect(guide.getByText(exercise.introduction)).toBeInTheDocument();
      exercise.equipment.forEach((item) => expect(guide.getByText(item)).toBeInTheDocument());
      expect(guide.getByText(exercise.guidance)).toBeInTheDocument();
      exercise.safety.forEach((note) => expect(guide.getByText(note)).toBeInTheDocument());

      const steps = within(guide.getByRole('list', { name: 'Steps' })).getAllByRole('listitem');
      expect(steps.map((step) => step.textContent)).toEqual(exercise.steps.map((s, i) => `${i + 1}${s.text}`));

      fireEvent.keyDown(document, { key: 'Escape' });
    });
  });

  test('Close and Escape close the guide and return focus to the View guide button', () => {
    render(<WellnessExercises />);
    const boxButton = screen.getByRole('button', { name: 'View guide: Box breathing' });
    fireEvent.click(boxButton);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(boxButton).toHaveFocus();

    const walkButton = screen.getByRole('button', { name: 'View guide: Easy 10-minute walk' });
    fireEvent.click(walkButton);
    expect(screen.getByRole('dialog', { name: 'Easy 10-minute walk' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(walkButton).toHaveFocus();
  });

  test('guides with a photo show it with a photographer credit; the others show neither', () => {
    render(<WellnessExercises />);
    const openGuide = (exercise) => {
      fireEvent.click(screen.getByRole('button', { name: `View guide: ${exercise.name}` }));
      return within(screen.getByRole('dialog', { name: exercise.name }));
    };

    EXERCISES.filter((e) => e.image).forEach((exercise) => {
      const guide = openGuide(exercise);
      expect(guide.getByRole('img', { name: exercise.imageAlt })).toHaveAttribute('src', exercise.image);
      const credit = guide.getByRole('link', { name: `${exercise.credit.photographer} on Pexels (opens in a new tab)` });
      expect(credit).toHaveAttribute('href', exercise.credit.url);
      expect(credit).toHaveAttribute('target', '_blank');
      expect(credit).toHaveAttribute('rel', 'noopener noreferrer');
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    EXERCISES.filter((e) => !e.image).forEach((exercise) => {
      const guide = openGuide(exercise);
      expect(guide.queryByRole('img')).toBeNull();
      expect(guide.queryByRole('link')).toBeNull();
      fireEvent.keyDown(document, { key: 'Escape' });
    });
  });

  test('a photo that fails to load is replaced by the placeholder', () => {
    render(<WellnessExercises />);
    const walk = byId('easy-walk');
    const card = within(cards()[EXERCISES.indexOf(walk)]);
    fireEvent.error(card.getByRole('img', { name: walk.imageAlt }));
    expect(card.queryByRole('img')).toBeNull();
    expect(card.getByTestId('exercise-image-placeholder')).toBeInTheDocument();
  });
});

describe('guide focus trap', () => {
  // Plain objects stand in for elements so the wrapping rules can be checked
  // with three focusable controls; the rendered tests below use the real guide.
  const heading = { name: 'heading' };
  const first = { name: 'first' };
  const middle = { name: 'middle' };
  const last = { name: 'last' };
  const focusable = [first, middle, last];

  test('Tab from the last focusable element wraps to the first', () => {
    expect(trapFocusTarget({ focusable, active: last, inside: true, shiftKey: false, start: heading })).toBe(first);
    expect(trapFocusTarget({ focusable, active: middle, inside: true, shiftKey: false, start: heading })).toBeNull();
  });

  test('Shift+Tab from the first focusable element (or the heading) wraps to the last', () => {
    expect(trapFocusTarget({ focusable, active: first, inside: true, shiftKey: true, start: heading })).toBe(last);
    expect(trapFocusTarget({ focusable, active: heading, inside: true, shiftKey: true, start: heading })).toBe(last);
    expect(trapFocusTarget({ focusable, active: middle, inside: true, shiftKey: true, start: heading })).toBeNull();
  });

  test('focus outside the guide is sent back inside, and an empty guide keeps focus on its heading', () => {
    expect(trapFocusTarget({ focusable, active: null, inside: false, shiftKey: false, start: heading })).toBe(first);
    expect(trapFocusTarget({ focusable, active: null, inside: false, shiftKey: true, start: heading })).toBe(last);
    expect(trapFocusTarget({ focusable: [], active: heading, inside: true, shiftKey: false, start: heading })).toBe(heading);
  });

  test('in a real guide with a photo, Tab wraps from the credit link to Close and Shift+Tab wraps back', () => {
    render(<WellnessExercises />);
    fireEvent.click(screen.getByRole('button', { name: 'View guide: Box breathing' }));
    const dialog = screen.getByRole('dialog', { name: 'Box breathing' });
    const heading = within(dialog).getByRole('heading', { level: 2, name: 'Box breathing' });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    const credit = within(dialog).getByRole('link', { name: /Katrin Bolovtsova on Pexels/ });
    expect(heading).toHaveFocus();

    // Shift+Tab from the heading wraps to the last control (the credit link).
    expect(fireEvent.keyDown(heading, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(credit).toHaveFocus();
    // Tab from the last control wraps to the first (Close).
    expect(fireEvent.keyDown(credit, { key: 'Tab' })).toBe(false);
    expect(close).toHaveFocus();
    // Shift+Tab from the first control wraps to the last.
    expect(fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(credit).toHaveFocus();
    // Between the two, moving forward from Close is left to the browser.
    act(() => { close.focus(); });
    expect(fireEvent.keyDown(close, { key: 'Tab' })).toBe(true);
  });

  test('in a real guide without a photo, Tab and Shift+Tab stay on its only control', () => {
    render(<WellnessExercises />);
    fireEvent.click(screen.getByRole('button', { name: 'View guide: Seated chin tuck' }));
    const dialog = screen.getByRole('dialog', { name: 'Seated chin tuck' });
    const heading = within(dialog).getByRole('heading', { level: 2, name: 'Seated chin tuck' });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(heading).toHaveFocus();

    // From the heading, Tab is left to the browser (the next element is Close).
    expect(fireEvent.keyDown(heading, { key: 'Tab' })).toBe(true);
    // Shift+Tab from the heading wraps to the last control instead of leaving.
    expect(fireEvent.keyDown(heading, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(close).toHaveFocus();
    // Close is both the first and last control, so Tab and Shift+Tab wrap onto it.
    expect(fireEvent.keyDown(close, { key: 'Tab' })).toBe(false);
    expect(close).toHaveFocus();
    expect(fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(close).toHaveFocus();
  });

  test('focus stays inside the open guide', () => {
    render(<WellnessExercises />);
    const behind = screen.getByRole('button', { name: 'All' });
    fireEvent.click(screen.getByRole('button', { name: 'View guide: Shoulder rolls' }));
    const dialog = screen.getByRole('dialog', { name: 'Shoulder rolls' });
    const heading = within(dialog).getByRole('heading', { level: 2, name: 'Shoulder rolls' });

    // Something behind the guide tries to take focus: it is pulled back.
    act(() => { behind.focus(); });
    expect(heading).toHaveFocus();

    // With nothing focused, Tab moves into the guide rather than the page.
    act(() => { heading.blur(); });
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(false);
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  test('Escape closes the guide and restores focus to its View guide button', () => {
    render(<WellnessExercises />);
    const button = screen.getByRole('button', { name: 'View guide: Seated chin tuck' });
    fireEvent.click(button);
    fireEvent.keyDown(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });

  test('switching between guides focuses each new heading and returns focus to the right button', () => {
    render(<WellnessExercises />);
    const boxButton = screen.getByRole('button', { name: 'View guide: Box breathing' });
    fireEvent.click(boxButton);
    expect(screen.getByRole('heading', { level: 2, name: 'Box breathing' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(boxButton).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Breathing Exercises' }));
    const bellyButton = screen.getByRole('button', { name: 'View guide: Belly breathing' });
    fireEvent.click(bellyButton);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const dialog = screen.getByRole('dialog', { name: 'Belly breathing' });
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Belly breathing' })).toHaveFocus();

    // The trap works in the second guide too: Tab from its last control wraps to Close.
    const close = within(dialog).getByRole('button', { name: 'Close' });
    const credit = within(dialog).getByRole('link', { name: /Anna Tarazevich on Pexels/ });
    act(() => { credit.focus(); });
    expect(fireEvent.keyDown(credit, { key: 'Tab' })).toBe(false);
    expect(close).toHaveFocus();

    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(bellyButton).toHaveFocus();
    expect(boxButton).not.toHaveFocus();
  });
});

describe('Meditation page with Wellness Exercises', () => {
  const renderPage = () => render(<MemoryRouter><MeditationTracker /></MemoryRouter>);

  test('the exercise section makes no API requests', async () => {
    renderPage();
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(screen.getByRole('heading', { name: 'Wellness Exercises' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Yoga' }));
    fireEvent.click(screen.getByRole('button', { name: 'View guide: Cat–cow' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([`get ${SESSIONS_URL}`]);
  });

  test('using the exercises does not interrupt the meditation timer', async () => {
    jest.useFakeTimers();
    renderPage();
    await waitFor(() => expect(requests).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => { jest.advanceTimersByTime(2000); });
    expect(screen.getByText('00:02')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Relaxation' }));
    fireEvent.click(screen.getByRole('button', { name: 'View guide: Progressive muscle relaxation' }));
    act(() => { jest.advanceTimersByTime(1000); });
    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => { jest.advanceTimersByTime(1000); });
    expect(screen.getByText('00:04')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    act(() => { jest.advanceTimersByTime(3000); });
    expect(screen.getByText('00:04')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
});
