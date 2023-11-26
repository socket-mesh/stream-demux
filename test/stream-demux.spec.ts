import assert from 'node:assert';
import { beforeEach, afterEach, describe, it } from "node:test";
import { StreamDemux } from "../src/stream-demux";

let pendingTimeoutSet = new Set<NodeJS.Timeout>();

type Packet = (string | number);

function wait(duration: number) {
	return new Promise<void>((resolve) => {
		let timeout = setTimeout(() => {
			pendingTimeoutSet.delete(timeout);
			resolve();
		}, duration);
		pendingTimeoutSet.add(timeout);
	});
}

function cancelAllPendingWaits() {
	for (let timeout of pendingTimeoutSet) {
		clearTimeout(timeout);
	}
}

describe('StreamDemux', () => {
	let demux: StreamDemux<Packet>;

	beforeEach(async () => {
		demux = new StreamDemux<string>();
	});

	afterEach(async () => {
		cancelAllPendingWaits();
	});

	it('should demultiplex packets over multiple substreams', async () => {
		(async () => {
			for (let i = 0; i < 10; i++) {
				await wait(10);
				demux.write('hello', 'world' + i);
				demux.write('abc', 'def' + i);
			}
			demux.close('hello');
			demux.close('abc');
		})();

		let receivedHelloPackets: Packet[] = [];
		let receivedAbcPackets: Packet[] = [];

		await Promise.all([
			(async () => {
				let substream = demux.listen('hello');
				for await (let packet of substream) {
					receivedHelloPackets.push(packet);
				}
			})(),
			(async () => {
				let substream = demux.listen('abc');
				for await (let packet of substream) {
					receivedAbcPackets.push(packet);
				}
			})()
		]);

		assert.strictEqual(receivedHelloPackets.length, 10);
		assert.strictEqual(receivedHelloPackets[0], 'world0');
		assert.strictEqual(receivedHelloPackets[1], 'world1');
		assert.strictEqual(receivedHelloPackets[9], 'world9');

		assert.strictEqual(receivedAbcPackets.length, 10);
		assert.strictEqual(receivedAbcPackets[0], 'def0');
		assert.strictEqual(receivedAbcPackets[1], 'def1');
		assert.strictEqual(receivedAbcPackets[9], 'def9');
	});

	it('should support iterating over a single substream from multiple consumers at the same time', async () => {
		(async () => {
			for (let i = 0; i < 10; i++) {
				await wait(10);
				demux.write('hello', 'world' + i);
			}
			demux.close('hello');
		})();

		let receivedPacketsA: Packet[] = [];
		let receivedPacketsB: Packet[] = [];
		let receivedPacketsC: Packet[] = [];
		let substream = demux.listen('hello');

		await Promise.all([
			(async () => {
				for await (let packet of substream) {
					receivedPacketsA.push(packet);
				}
			})(),
			(async () => {
				for await (let packet of substream) {
					receivedPacketsB.push(packet);
				}
			})(),
			(async () => {
				for await (let packet of substream) {
					receivedPacketsC.push(packet);
				}
			})()
		]);

		assert.strictEqual(receivedPacketsA.length, 10);
		assert.strictEqual(receivedPacketsB.length, 10);
		assert.strictEqual(receivedPacketsC.length, 10);
	});

	it('should support iterating over a substream using a while loop', async () => {
		(async () => {
			for (let i = 0; i < 10; i++) {
				await wait(10);
				demux.write('hello', 'world' + i);
				demux.write('hello', 'foo' + i);
			}
			demux.close('hello');
		})();

		let receivedPackets: Packet[] = [];
		let consumer = demux.listen('hello').createConsumer();

		assert.strictEqual(consumer.getBackpressure(), 0);

		while (true) {
			let packet = await consumer.next();
			if (packet.done) break;
			receivedPackets.push(packet.value);
		}

		assert.strictEqual(receivedPackets.length, 20);
		assert.strictEqual(receivedPackets[0], 'world0');
		assert.strictEqual(receivedPackets[1], 'foo0');
		assert.strictEqual(receivedPackets[2], 'world1');
		assert.strictEqual(receivedPackets[3], 'foo1');
	});

	it('should support closing all streams using a single closeAll command', async () => {
		(async () => {
			for (let i = 0; i < 10; i++) {
				await wait(10);
				demux.write('hello', 'world' + i);
				demux.write('abc', 'def' + i);
			}
			demux.closeAll();
		})();

		let receivedHelloPackets: Packet[] = [];
		let receivedAbcPackets: Packet[] = [];

		await Promise.all([
			(async () => {
				let substream = demux.listen('hello');
				for await (let packet of substream) {
					receivedHelloPackets.push(packet);
				}
			})(),
			(async () => {
				let substream = demux.listen('abc');
				for await (let packet of substream) {
					receivedAbcPackets.push(packet);
				}
			})()
		]);

		assert.strictEqual(receivedHelloPackets.length, 10);
		assert.strictEqual(receivedAbcPackets.length, 10);
	});

	it('should support resuming stream consumption after the stream has been closed', async () => {
		(async () => {
			for (let i = 0; i < 10; i++) {
				await wait(10);
				demux.write('hello', 'a' + i);
			}
			demux.close('hello');
		})();

		let receivedPacketsA: Packet[] = [];
		for await (let packet of demux.listen('hello')) {
			receivedPacketsA.push(packet);
		}

		assert.strictEqual(receivedPacketsA.length, 10);

		(async () => {
			for (let i = 0; i < 10; i++) {
				await wait(10);
				demux.write('hello', 'b' + i);
			}
			demux.close('hello');
		})();

		let receivedPacketsB: Packet[] = [];
		for await (let packet of demux.listen('hello')) {
			receivedPacketsB.push(packet);
		}

		assert.strictEqual(receivedPacketsB.length, 10);
	});

	it('should support resuming stream consumption after the stream has been closed using closeAll', async () => {
		(async () => {
			for (let i = 0; i < 10; i++) {
				await wait(10);
				demux.write('hello', 'a' + i);
			}
			demux.closeAll();
		})();

		let receivedPacketsA: Packet[] = [];
		for await (let packet of demux.listen('hello')) {
			receivedPacketsA.push(packet);
		}

		assert.strictEqual(receivedPacketsA.length, 10);

		(async () => {
			for (let i = 0; i < 10; i++) {
				await wait(10);
				demux.write('hello', 'b' + i);
			}
			demux.closeAll();
		})();

		let receivedPacketsB: Packet[] = [];
		for await (let packet of demux.listen('hello')) {
			receivedPacketsB.push(packet);
		}

		assert.strictEqual(receivedPacketsB.length, 10);
	});

	it('should support writing multiple times within the same call stack and across multiple streams', async () => {
		(async () => {
			for (let i = 0; i < 10; i++) {
				await wait(20);
				for (let j = 0; j < 10; j++) {
					demux.write('hello', 'world' + i + '-' + j);
				}
			}
			demux.close('hello');
		})();

		(async () => {
			for (let i = 0; i < 10; i++) {
				await wait(10);
				for (let j = 0; j < 5; j++) {
					demux.write('other', 'message' + i + '-' + j);
				}
			}
			demux.close('other');
		})();

		let substream = demux.listen('hello');
		let otherSubstream = demux.listen('other');
		let otherReceivedPackets: Packet[] = [];

		(async () => {
			for await (let otherPacket of otherSubstream) {
				await wait(10);
				otherReceivedPackets.push(otherPacket);
			}
		})();

		(async () => {
			for await (let otherPacket of otherSubstream) {
				await wait(20);
				otherReceivedPackets.push(otherPacket);
			}
		})();

		let receivedPackets: Packet[] = [];

		for await (let packet of substream) {
			await wait(20);
			receivedPackets.push(packet);
		}

		assert.strictEqual(receivedPackets.length, 100);
		assert.strictEqual(otherReceivedPackets.length, 100);
	});

	it('should support writing an arbitrarily large number of times within the same call stack', async () => {
		(async () => {
			await wait(50);
			for (let i = 0; i < 100; i++) {
				demux.write('hello', 'world' + i);
			}
			demux.close('hello');
		})();

		let substream = demux.listen('hello');

		let receivedPackets: Packet[] = [];

		for await (let packet of substream) {
			receivedPackets.push(packet);
			await wait(10);
		}

		assert.strictEqual(receivedPackets.length, 100);
	});

	it('should support writing an arbitrarily large number of times within the same call stack with multiple concurrent consumers', async () => {
		(async () => {
			await wait(50);
			for (let i = 0; i < 50; i++) {
				demux.write('other', 'message' + i);
			}
			demux.close('other');
		})();

		let otherSubstream = demux.listen('other');
		let receivedPackets: Packet[] = [];

		(async () => {
			for await (let otherPacket of otherSubstream) {
				await wait(10);
				receivedPackets.push(otherPacket);
			}
		})();

		for await (let otherPacket of otherSubstream) {
			await wait(20);
			receivedPackets.push(otherPacket);
		}

		assert.strictEqual(receivedPackets.length, 100);
	});

	it('should write to the no-named stream if no listeners are found', async () => {
		(async () => {
			await wait(10);

			demux.write('hi', 'world1');
			demux.write('hello', 'world2');
			demux.closeAll();
		})();

		let otherPackets: Packet[] = [];
		let helloPackets: Packet[] = [];
		let otherSubstream = demux.listen('');
		let helloSubstream = demux.listen('hello');

		(async () => {
			for await (let packet of otherSubstream) {
				otherPackets.push(packet);
				await wait(10);
			}
		})();

		(async () => {
			for await (let packet of helloSubstream) {
				helloPackets.push(packet);
				await wait(10);
			}
		})();

		await wait(50);

		assert.strictEqual(otherPackets[0], 'world1');
		assert.strictEqual(otherPackets.length, 1);
		assert.strictEqual(helloPackets[0], 'world2');
		assert.strictEqual(helloPackets.length, 1);
	});

	it('should support the stream.once() method', async () => {
		(async () => {
			for (let i = 0; i < 10; i++) {
				await wait(10);
				demux.write('hello', 'world' + i);
			}
			demux.close('hello');
		})();

		let substream = demux.listen('hello');

		let packet = await substream.once();
		assert.strictEqual(packet, 'world0');

		packet = await substream.once();
		assert.strictEqual(packet, 'world1');

		packet = await substream.once();
		assert.strictEqual(packet, 'world2');
	});

	it('should not resolve stream.once() when stream is closed', async () => {
		(async () => {
			await wait(10);
			demux.close('hello');
		})();

		let substream = demux.listen('hello');
		let receivedPackets: Packet[] = [];

		(async () => {
			let packet = await substream.once();
			receivedPackets.push(packet);
		})();

		await wait(100);
		assert.strictEqual(receivedPackets.length, 0);
	});

	it('should support the stream.once() method with timeout', async () => {
		(async () => {
			for (let i = 0; i < 3; i++) {
				await wait(20);
				demux.write('hello', 'world' + i);
			}
			demux.close('hello');
		})();

		let substream = demux.listen('hello');

		let packet: (string | number | null) = await substream.once(30);
		assert.strictEqual(packet, 'world0');

		let error: Error | null = null;
		packet = null;
		try {
			packet = await substream.once(10);
		} catch (err) {
			error = err;
		}
		assert.notEqual(error, null);
		assert.strictEqual(error?.name, 'TimeoutError');
		assert.strictEqual(packet, null);
	});

	it('should prevent stream.once() timeout from being reset when writing to other streams', async () => {
		(async () => {
			for (let i = 0; i < 15; i++) {
				await wait(20);
				demux.write('hi', 'test');
			}
		})();

		let substream = demux.listen('hello');

		let packet;
		let error;
		try {
			packet = await substream.once(200);
		} catch (err) {
			error = err;
		}

		assert.notEqual(error, undefined);
		assert.strictEqual(error.name, 'TimeoutError');
		assert.strictEqual(packet, undefined);
	});

	it('should prevent stream timeout from being reset when writing to other streams when iterating over consumer with timeout', async () => {
		(async () => {
			for (let i = 0; i < 10; i++) {
				await wait(200);
				demux.write('foo', 123);
				await wait(200);
				demux.write('hello', 'test' + i);
			}
			demux.kill('hello');
		})();

		let consumer = demux.listen('hello').createConsumer(300);
		let error: Error | null = null;

		let packet: IteratorResult<Packet, Packet> | null = null;

		try {
			while (true) {
				packet = await consumer.next();

				if (packet.done) break;
			}
		} catch (err) {
			error = err;
		}

		assert.notEqual(error, null);
		assert.strictEqual(error!.name, 'TimeoutError')
		assert.strictEqual(packet, null);
	});

	it('should prevent stream.once() timeout from being reset when killing other streams', async () => {
		(async () => {
			for (let i = 0; i < 15; i++) {
				await wait(20);
				demux.kill('hi' + i, 'test');
			}
		})();

		let substream = demux.listen('hello');

		let packet;
		let error;
		try {
			packet = await substream.once(200);
		} catch (err) {
			error = err;
		}

		assert.notEqual(error, undefined);
		assert.strictEqual(error.name, 'TimeoutError');
		assert.strictEqual(packet, undefined);
	});

	it('should support stream.once() timeout after killing the stream', async () => {
		(async () => {
			await wait(20);
			demux.kill('hello', 'test');
		})();

		let substream = demux.listen('hello');

		let start = Date.now();

		let packet: Packet;
		let error: any;

		try {
			packet = await substream.once(200);
		} catch (err) {
			error = err;
		}
		assert.notEqual(error, undefined);
		assert.strictEqual(error.name, 'TimeoutError');
		assert.strictEqual(packet!, undefined);
	});

	it('should support stream.next() method with close command', async () => {
		(async () => {
			for (let i = 0; i < 3; i++) {
				await wait(10);
				demux.write('hello', 'world' + i);
			}
			await wait(10);
			demux.close('hello');
		})();

		let substream = demux.listen('hello');

		let packet = await substream.next();
		assert.strictEqual(JSON.stringify(packet), JSON.stringify({value: 'world0', done: false}));

		packet = await substream.next();
		assert.strictEqual(JSON.stringify(packet), JSON.stringify({value: 'world1', done: false}));

		packet = await substream.next();
		assert.strictEqual(JSON.stringify(packet), JSON.stringify({value: 'world2', done: false}));

		packet = await substream.next();
		assert.strictEqual(JSON.stringify(packet), JSON.stringify({value: undefined, done: true}));
	});

	it('should support stream.next() method with closeAll command', async () => {
		(async () => {
			await wait(10);
			demux.write('hello', 'world');
			await wait(10);
			demux.closeAll();
		})();

		let substream = demux.listen('hello');

		let packet = await substream.next();
		assert.strictEqual(JSON.stringify(packet), JSON.stringify({value: 'world', done: false}));

		packet = await substream.next();
		assert.strictEqual(JSON.stringify(packet), JSON.stringify({value: undefined, done: true}));
	});

	it('should support writeToConsumer method', async () => {
		const receivedPackets: Packet[] = [];
		const consumer = demux.listen('hello').createConsumer();

		(async () => {
			await wait(50);
			for (let i = 0; i < 10; i++) {
				await wait(10);
				demux.writeToConsumer(consumer.id, 'world' + i);
			}
			// Writing to a non-existent consumer should be ignored.
			demux.writeToConsumer(123, 'foo');
			demux.close('hello', 'hi');
		})();

		while (true) {
			let packet = await consumer.next();
			receivedPackets.push(packet.value);
			if (packet.done) break;
		}

		assert.strictEqual(receivedPackets.length, 11);
		assert.strictEqual(receivedPackets[0], 'world0');
		assert.strictEqual(receivedPackets[1], 'world1');
		assert.strictEqual(receivedPackets[9], 'world9');
		assert.strictEqual(receivedPackets[10], 'hi');
	});

	it('should support closeConsumer method', async () => {
		let receivedPackets: Packet[] = [];
		let consumer = demux.listen('hello').createConsumer();

		(async () => {
			for (let i = 0; i < 10; i++) {
				await wait(10);
				demux.write('hello', 'world' + i);
			}
			demux.close(consumer.id, 'hi');

			// Closing a non-existent consumer should be ignored.
			demux.close(123, 'bar');
		})();

		while (true) {
			let packet = await consumer.next();
			receivedPackets.push(packet.value);
			if (packet.done) break;
		}

		assert.strictEqual(receivedPackets.length, 11);
		assert.strictEqual(receivedPackets[0], 'world0');
		assert.strictEqual(receivedPackets[1], 'world1');
		assert.strictEqual(receivedPackets[9], 'world9');
		assert.strictEqual(receivedPackets[10], 'hi');
	});

	it('should support getConsumerStats method', async () => {
		let consumer = demux.listen('hello').createConsumer();

		for (let i = 0; i < 10; i++) {
			demux.write('hello', 'world' + i);
		}
		demux.close('hello', 'hi');

		let consumerStats = demux.getConsumerStats(consumer.id);
		assert.notEqual(consumerStats, null);
		assert.strictEqual(consumerStats.id, consumer.id);
		assert.strictEqual(consumerStats.backpressure, 11);
		assert.strictEqual(consumerStats.backpressure, consumer.getBackpressure());

		consumer.return();

		consumerStats = demux.getConsumerStats(consumer.id);
		assert.strictEqual(consumerStats, undefined);
	});

	it('should support getConsumerStatsList method', async () => {
		let consumerA = demux.listen('hello').createConsumer();

		for (let i = 0; i < 10; i++) {
			demux.write('hello', 'world' + i);
		}

		let consumerB = demux.listen('hello').createConsumer();

		demux.write('hello', '123');
		demux.close('hello', 'hi');

		let consumerStatsList = demux.getConsumerStats('hello');
		assert.strictEqual(consumerStatsList.length, 2);
		assert.strictEqual(consumerStatsList[0].id, consumerA.id);
		assert.strictEqual(consumerStatsList[0].backpressure, 12);
		assert.strictEqual(consumerStatsList[0].backpressure, consumerA.getBackpressure());
		assert.strictEqual(consumerStatsList[1].id, consumerB.id);
		assert.strictEqual(consumerStatsList[1].backpressure, 2);
		assert.strictEqual(consumerStatsList[1].backpressure, consumerB.getBackpressure());

		consumerStatsList = demux.getConsumerStats('bar');
		assert.strictEqual(consumerStatsList.length, 0);

		consumerA.return();
		consumerB.return();
	});

	it('should support getConsumerStatsListAll method', async () => {
		let consumerA = demux.listen('hello').createConsumer();

		for (let i = 0; i < 10; i++) {
			demux.write('hello', 'world' + i);
		}

		let consumerB = demux.listen('hello').createConsumer();
		let consumerC = demux.listen('foo').createConsumer();

		demux.write('hello', '123');
		demux.close('hello', 'hi');

		let consumerStatsList = demux.getConsumerStats();
		assert.strictEqual(consumerStatsList.length, 3);
		assert.strictEqual(consumerStatsList[0].id, consumerA.id);
		assert.strictEqual(consumerStatsList[0].backpressure, 12);
		assert.strictEqual(consumerStatsList[0].backpressure, consumerA.getBackpressure());
		assert.strictEqual(consumerStatsList[1].id, consumerB.id);
		assert.strictEqual(consumerStatsList[1].backpressure, 2);
		assert.strictEqual(consumerStatsList[1].backpressure, consumerB.getBackpressure());
		assert.strictEqual(consumerStatsList[2].id, consumerC.id);
		assert.strictEqual(consumerStatsList[2].backpressure, 0);
		assert.strictEqual(consumerStatsList[2].backpressure, consumerC.getBackpressure());

		consumerA.return();
		consumerB.return();
		consumerC.return();

		consumerStatsList = demux.getConsumerStats();
		assert.strictEqual(consumerStatsList.length, 0);
	});

	it('should support kill method', async () => {
		let consumerA = demux.listen('hello').createConsumer();
		let consumerB = demux.listen('hello').createConsumer();

		for (let i = 0; i < 10; i++) {
			demux.write('hello', 'world' + i);
		}

		let receivedPackets: IteratorResult<Packet, Packet>[] = [];

		(async () => {
			while (true) {
				let packet = await consumerA.next();
				receivedPackets.push(packet);
				if (packet.done) break;
				await wait(30);
			}
		})();

		await wait(80);

		demux.kill('hello', 'end');

		await wait(50);

		assert.strictEqual(receivedPackets.length, 4);
		assert.strictEqual(receivedPackets[0].value, 'world0');
		assert.strictEqual(receivedPackets[1].value, 'world1');
		assert.strictEqual(receivedPackets[2].value, 'world2');
		assert.strictEqual(receivedPackets[3].done, true);
		assert.strictEqual(receivedPackets[3].value, 'end');
		assert.strictEqual(consumerA.getBackpressure(), 0);
		assert.strictEqual(consumerB.getBackpressure(), 0);
	});

	it('should support killAll method', async () => {
		let consumerA = demux.listen('hello').createConsumer();
		let consumerB = demux.listen('hello').createConsumer();
		let consumerC = demux.listen('hi').createConsumer();

		for (let i = 0; i < 10; i++) {
			demux.write('hello', 'world' + i);
			demux.write('hi', 'world' + i);
		}

		let receivedPacketsA: IteratorResult<Packet, Packet>[] = [];
		let receivedPacketsC: IteratorResult<Packet, Packet>[] = [];

		(async () => {
			while (true) {
				let packet = await consumerA.next();
				receivedPacketsA.push(packet);
				if (packet.done) break;
				await wait(30);
			}
		})();
		(async () => {
			while (true) {
				let packet = await consumerC.next();
				receivedPacketsC.push(packet);
				if (packet.done) break;
				await wait(30);
			}
		})();

		await wait(80);
		demux.killAll('bar');
		await wait(50);

		assert.strictEqual(receivedPacketsA.length, 4);
		assert.strictEqual(receivedPacketsA[0].value, 'world0');
		assert.strictEqual(receivedPacketsA[1].value, 'world1');
		assert.strictEqual(receivedPacketsA[2].value, 'world2');
		assert.strictEqual(receivedPacketsA[3].done, true);
		assert.strictEqual(receivedPacketsA[3].value, 'bar');
		assert.strictEqual(receivedPacketsC.length, 4);
		assert.strictEqual(receivedPacketsC[0].value, 'world0');
		assert.strictEqual(receivedPacketsC[1].value, 'world1');
		assert.strictEqual(receivedPacketsC[2].value, 'world2');
		assert.strictEqual(receivedPacketsC[3].done, true);
		assert.strictEqual(receivedPacketsC[3].value, 'bar');
		assert.strictEqual(consumerA.getBackpressure(), 0);
		assert.strictEqual(consumerB.getBackpressure(), 0);
	});

	it('should support killConsumer method', async () => {
		let consumerA = demux.listen('hello').createConsumer();
		let consumerB = demux.listen('hello').createConsumer();

		for (let i = 0; i < 10; i++) {
			demux.write('hello', 'world' + i);
		}

		let receivedPacketsA: IteratorResult<Packet, Packet>[] = [];
		let receivedPacketsB: IteratorResult<Packet, Packet>[] = [];

		(async () => {
			while (true) {
				let packet = await consumerA.next();
				receivedPacketsA.push(packet);
				if (packet.done) break;
				await wait(30);
			}
		})();

		(async () => {
			while (true) {
				let packet = await consumerB.next();
				receivedPacketsB.push(packet);
				if (packet.done) break;
				await wait(30);
			}
		})();

		await wait(80);

		demux.kill(consumerA.id, 'the end');

		await wait(350);

		assert.strictEqual(receivedPacketsA.length, 4);
		assert.strictEqual(receivedPacketsA[0].value, 'world0');
		assert.strictEqual(receivedPacketsA[1].value, 'world1');
		assert.strictEqual(receivedPacketsA[2].value, 'world2');
		assert.strictEqual(receivedPacketsA[3].done, true);
		assert.strictEqual(receivedPacketsA[3].value, 'the end');

		assert.strictEqual(receivedPacketsB.length, 10);
		assert.strictEqual(receivedPacketsB[0].value, 'world0');
		assert.strictEqual(receivedPacketsB[1].value, 'world1');
		assert.strictEqual(receivedPacketsB[9].value, 'world9');

		assert.strictEqual(consumerA.getBackpressure(), 0);
		assert.strictEqual(consumerB.getBackpressure(), 0);
	});

	it('should support getBackpressure method', async () => {
		let consumer = demux.listen('hello').createConsumer();

		demux.write('hello', 'world0');
		demux.write('hello', 'world1');

		assert.strictEqual(demux.getBackpressure('hello'), 2);

		demux.write('hello', 'world2');
		demux.write('hello', 'world3');

		assert.strictEqual(demux.getBackpressure('hello'), 4);

		demux.kill('hello');

		assert.strictEqual(demux.getBackpressure('hello'), 0);
	});

	it('should support getBackpressureAll method', async () => {
		let consumerA = demux.listen('hello').createConsumer();
		let consumerB = demux.listen('hi').createConsumer();

		demux.write('hello', 'world0');
		demux.write('hello', 'world1');

		assert.strictEqual(demux.getBackpressure(), 2);

		demux.write('hi', 'message');
		demux.write('hi', 'message');
		demux.write('hi', 'message');
		demux.write('hi', 'message');

		assert.strictEqual(demux.getBackpressure(), 4);

		demux.kill('hi');

		assert.strictEqual(demux.getBackpressure(), 2);

		demux.kill('hello');

		assert.strictEqual(demux.getBackpressure(), 0);
	});

	it('should support getConsumerBackpressure method', async () => {
		let consumerA = demux.listen('hello').createConsumer();
		let consumerB = demux.listen('hi').createConsumer();

		demux.write('hello', 'world0');
		demux.write('hello', 'world1');

		demux.write('hi', 'message');
		demux.write('hi', 'message');
		demux.write('hi', 'message');
		demux.write('hi', 'message');

		assert.strictEqual(demux.getBackpressure(consumerA.id), 2);
		assert.strictEqual(demux.getBackpressure(consumerB.id), 4);

		demux.kill('hi');

		assert.strictEqual(demux.getBackpressure(consumerA.id), 2);
		assert.strictEqual(demux.getBackpressure(consumerB.id), 0);

		demux.kill('hello');

		assert.strictEqual(demux.getBackpressure(consumerA.id), 0);
		assert.strictEqual(demux.getBackpressure(consumerB.id), 0);
	});

	it('should support hasConsumer method', async () => {
		let consumerA = demux.listen('hello').createConsumer();
		let consumerB = demux.listen('hi').createConsumer();

		assert.strictEqual(demux.hasConsumer('hello', 123), false);
		assert.strictEqual(demux.hasConsumer('hello', consumerA.id), true);
		assert.strictEqual(demux.hasConsumer('hi', consumerB.id), true);
		assert.strictEqual(demux.hasConsumer('hello', consumerB.id), false);
		assert.strictEqual(demux.hasConsumer('hi', consumerA.id), false);
	});

	it('should support hasConsumerAll method', async () => {
		let consumerA = demux.listen('hello').createConsumer();
		let consumerB = demux.listen('hi').createConsumer();

		assert.strictEqual(demux.hasConsumer(123), false);
		assert.strictEqual(demux.hasConsumer(consumerA.id), true);
		assert.strictEqual(demux.hasConsumer(consumerB.id), true);
	});
});
