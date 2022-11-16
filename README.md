# modplayer

TypeScript mod player/tracker.

## Usage

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

Converted to TypeScript and published to npm by Alasdair McLeay.
