// Provide Buffer/global for stellar-sdk + snarkjs in the browser.
import { Buffer } from "buffer";
if (!globalThis.Buffer) globalThis.Buffer = Buffer;
if (!globalThis.global) globalThis.global = globalThis;
