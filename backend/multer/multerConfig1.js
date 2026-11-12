import { createImageUpload } from './multerConfig.js';

// Journal cover pictures (served from /upload1).
const upload1 = createImageUpload('upload1');

export default upload1;
