# modplayer

TypeScript mod player/tracker.

## Usage

### AudioWorklet

```ts
import modplayerWorkletUrl from "modplayer/worklet?worker&url";
import { loadWorkletFromBuffer, loadBufferFromUrl } from "modplayer";

const context = new AudioContext({
  sampleRate: 44100,
});
await context.audioWorklet.addModule(modplayerWorkletUrl);
const addModulePromise = context.audioWorklet.addModule(modplayerWorkletUrl);
const { buffer, ext } = await loadBufferFromUrl("/assets/cooltune.mod");
const worklet = loadWorkletFromBuffer(ext, buffer, context, {
    options: {
    autoplay: true,
    repeat: true,
  },
});

worklet.connect(context.destination);
```

[CodeSandbox example](https://codesandbox.io/s/modplayer-example-67p37i)

## Credits

Based upon @electronoora's [webaudio-mod-player](https://github.com/electronoora/webaudio-mod-player).

Forked by Alasdair McLeay:

- Converted to TypeScript
- Published to npm
- Added AudioWorklet (threading) support
