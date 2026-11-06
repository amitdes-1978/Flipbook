// Entry for the standalone viewer runtime bundled into exported HTML files.
import { mountViewer } from './viewer.js';
import { qrSvg } from '../vendor/qr.mjs';
window.FlipForge = { mountViewer, qrSvg };
