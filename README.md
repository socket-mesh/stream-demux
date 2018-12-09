# stream-demux
An asynchronous iterable stream demultiplexer.

Lets you write data to multiple async iterable streams from a central place without keeping any references to those streams.
The `StreamDemux` class returns streams of class `DemuxedAsyncIterableStream` (base class `AsyncIterableStream`).  
See https://github.com/SocketCluster/async-iterable-stream

## Installation

```
npm install stream-demux
```

## Usage

### Consuming using async loops

```js
let demux = new StreamDemux();

(async () => {
  // Consume data from 'abc' stream.
  let substream = demux.stream('abc');
  for await (let packet of substream) {
    console.log('ABC:', packet);
  }
})();

(async () => {
  // Consume data from 'def' stream.
  let substream = demux.stream('def');
  for await (let packet of substream) {
    console.log('DEF:', packet);
  }
})();

(async () => {
  // Consume data from 'def' stream.
  // Can also work with a while loop for older environments.
  // Can have multiple loops consuming the same stream at
  // the same time.
  let asyncIterator = demux.stream('def').getAsyncIterator();
  while (true) {
    let packet = await asyncIterator.next();
    if (packet.done) break;
    console.log('DEF (while loop):', packet.value);
  }
})();

(async () => {
  for (let i = 0; i < 10; i++) {
    await wait(10);
    demux.write('abc', 'message-abc-' + i);
    demux.write('def', 'message-def-' + i);
  }
  demux.close('abc');
  demux.close('def');
})();

// Utility function for using setTimeout() with async/await.
function wait(duration) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, duration);
  });
}
```

### Consuming using the once method

```js
// Log the next received packet from the abc stream.
(async () => {
  // The returned promise never times out.
  let packet = await demux.stream('abc').once();
  console.log('Packet:', packet);
})();

// Same as above, except with a timeout of 10 seconds.
(async () => {
  let packet;
  try {
    packet = await demux.stream('abc').once(10000);
    console.log('Packet:', packet);
  } catch (err) {
    // If no packets are written to the 'abc' stream before
    // the timeout, an error will be thrown and handled here.
    // The err.name property will be 'TimeoutError'.
    console.log('Error:', err);
  }
})();
```

## Goal

The goal of this module is to efficiently distribute data to a large number of named asynchronous streams while facilitating functional programming patterns which decrease the probability of memory leaks.

Each stream returned by this module is responsible for picking up its own data from a shared source stream - This means that the stream-demux module doesn't hold any references to streams which it produces via its `stream()` method; this reduces the likelihood of programming mistakes which would lead to memory leaks because streams don't need to be destroyed or cleaned up explicitly.

The downside to making each stream responsible for consuming its own data is that having a lot of concurrent streams can have a negative impact on performance (especially if there are a lot of idle streams). A goal of stream-demux is to keep that overhead to a minimum.
