const supportedformats = ["mod", "s3m", "xm"];

export const loadBufferFromUrl = async (url: string) => {
  let ext = url.split(".").pop()?.toLowerCase().trim();
  if (!ext || supportedformats.indexOf(ext) == -1) {
    // unknown extension, maybe amiga-style prefix?
    ext = url.split("/").pop()?.split(".").shift()?.toLowerCase().trim();
    if (!ext || supportedformats.indexOf(ext) == -1) {
      // ok, give up
      throw new Error(`Unsupported file extension ${ext}`);
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error, status = ${response.status}`);
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  return { buffer, ext };
};
