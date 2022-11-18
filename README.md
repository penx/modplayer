# modplayer

TypeScript mod player/tracker.

## Usage

### AudioWorklet

```ts
// ModWorkletProcessor.ts 
import { register } from "modplayer/ModWorkletProcessor";
register();
```

```ts
// main.ts
import ModWorkletProcessor from "./ModWorkletProcessor.ts?url";
const context = new AudioContext();
await context.audioWorklet.addModule(ModWorkletProcessor);
const worklet = await loadWorkletFromUrl("/assets/cooltune.mod", context, {
  options: {
    autoplay: true,
    repeat: true,
  },
});
worklet.connect(analyser).connect(_context.destination);
```

### ScriptProcessor ([deprecated](https://developer.mozilla.org/en-US/docs/Web/API/ScriptProcessorNode))

```ts
import { loadUrl } from "modplayer";

let player;

window.play = () => {
  if (!player) {
    player = loadUrl("/assets/cooltune.mod", { autoplay: true });
  } else {
    player.position = 0;
    player.row = 0;
  }
};

document.getElementById("app").innerHTML = `
<button onclick="play()">Play</button>
`;
```

[CodeSandbox example](https://codesandbox.io/s/modplayer-example-67p37i)

## Credits

Based upon @electronoora's [webaudio-mod-player](https://github.com/electronoora/webaudio-mod-player).

Forked by Alasdair McLeay:

- Converted to TypeScript
- Published to npm
- Added AudioWorklet (threading) support
