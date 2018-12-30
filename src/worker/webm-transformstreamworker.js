import webmWasm from "../../dist/webm-wasm.js";

function nextEvent(target, name) {
  return new Promise(resolve => {
    target.addEventListener(name, resolve, { once: true });
  });
}

export function initWasmModule(moduleFactory, wasmUrl) {
  return new Promise(resolve => {
    const module = moduleFactory({
      // Just to be safe, don't automatically invoke any wasm functions
      noInitialRun: true,
      locateFile(url) {
        if (url.endsWith(".wasm")) {
          return wasmUrl;
        }
        return url;
      },
      onRuntimeInitialized() {
        // An Emscripten is a then-able that resolves with itself, causing an infite loop when you
        // wrap it in a real promise. Delete the `then` prop solves this for now.
        // https://github.com/kripken/emscripten/issues/5820
        delete module.then;
        resolve(module);
      }
    });
  });
}

function createTransformStream(module, ev) {
  let encoder;
  const ts = new TransformStream({
    start(controller) {
      encoder = new module.WebmEncoder(...ev.data, b => {
        const copy = new Uint8Array(b);
        controller.enqueue(copy.buffer);
      });
      if (encoder.lastError()) {
        console.error(encoder.lastError());
        controller.close();
      }
    },
    transform(chunk, controller) {
      if (!encoder.addRGBAFrame(chunk)) {
        console.error(encoder.lastError());
        controller.close();
      }
    },
    flush() {
      // This will invoke the callback to flush
      encoder.finalize();
      encoder.delete();
    }
  });
  postMessage(ts, [ts]);
}

async function init() {
  const wasmPath = (await nextEvent(self, "message")).data;
  const module = await initWasmModule(webmWasm, wasmPath);
  addEventListener("message", ev => createTransformStream(module, ev));
  postMessage("READY");
}
init();
