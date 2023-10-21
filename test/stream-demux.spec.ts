import { StreamDemux } from "../src/stream-demux";
import { describe, it, expect } from '@jest/globals';

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

		expect(receivedHelloPackets.length).toBe(10);
		expect(receivedHelloPackets[0]).toBe('world0');
		expect(receivedHelloPackets[1]).toBe('world1');
		expect(receivedHelloPackets[9]).toBe('world9');

		expect(receivedAbcPackets.length).toBe(10);
		expect(receivedAbcPackets[0]).toBe('def0');
		expect(receivedAbcPackets[1]).toBe('def1');
		expect(receivedAbcPackets[9]).toBe('def9');
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

		expect(receivedPacketsA.length).toBe(10);
		expect(receivedPacketsB.length).toBe(10);
		expect(receivedPacketsC.length).toBe(10);
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

		expect(consumer.getBackpressure()).toBe(0);

		while (true) {
			let packet = await consumer.next();
			if (packet.done) break;
			receivedPackets.push(packet.value);
		}

		expect(receivedPackets.length).toBe(20);
		expect(receivedPackets[0]).toBe('world0');
		expect(receivedPackets[1]).toBe('foo0');
		expect(receivedPackets[2]).toBe('world1');
		expect(receivedPackets[3]).toBe('foo1');
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

		expect(receivedHelloPackets.length).toBe(10);
		expect(receivedAbcPackets.length).toBe(10);
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

		expect(receivedPacketsA.length).toBe(10);

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

		expect(receivedPacketsB.length).toBe(10);
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

		expect(receivedPacketsA.length).toBe(10);

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

		expect(receivedPacketsB.length).toBe(10);
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

		expect(receivedPackets.length).toBe(100);
		expect(otherReceivedPackets.length).toBe(100);
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

		expect(receivedPackets.length).toBe(100);
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

		expect(receivedPackets.length).toBe(100);
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
		expect(packet).toBe('world0');

		packet = await substream.once();
		expect(packet).toBe('world1');

		packet = await substream.once();
		expect(packet).toBe('world2');
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
		expect(receivedPackets.length).toBe(0);
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
		expect(packet).toBe('world0');

		let error: Error | null = null;
		packet = null;
		try {
			packet = await substream.once(10);
		} catch (err) {
			error = err;
		}
		expect(error).not.toBe(null);
		expect(error?.name).toBe('TimeoutError');
		expect(packet).toBe(null);
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

		expect(error).not.toBe(undefined);
		expect(error.name).toBe('TimeoutError');
		expect(packet).toBe(undefined);
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

		expect(error).not.toBe(null);
		expect(error!.name).toBe('TimeoutError')
		expect(packet).toBe(null);
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

		expect(error).not.toBe(undefined);
		expect(error.name).toBe('TimeoutError');
		expect(packet).toBe(undefined);
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
		expect(error).not.toBe(undefined);
		expect(error.name).toBe('TimeoutError');
		expect(packet!).toBe(undefined);
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
		expect(JSON.stringify(packet)).toBe(JSON.stringify({value: 'world0', done: false}));

		packet = await substream.next();
		expect(JSON.stringify(packet)).toBe(JSON.stringify({value: 'world1', done: false}));

		packet = await substream.next();
		expect(JSON.stringify(packet)).toBe(JSON.stringify({value: 'world2', done: false}));

		packet = await substream.next();
		expect(JSON.stringify(packet)).toBe(JSON.stringify({value: undefined, done: true}));
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
		expect(JSON.stringify(packet)).toBe(JSON.stringify({value: 'world', done: false}));

		packet = await substream.next();
		expect(JSON.stringify(packet)).toBe(JSON.stringify({value: undefined, done: true}));
	});

	it('should support writeToConsumer method', async () => {
		let receivedPackets: Packet[] = [];
		let consumer = demux.listen('hello').createConsumer();

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

		expect(receivedPackets.length).toBe(11);
		expect(receivedPackets[0]).toBe('world0');
		expect(receivedPackets[1]).toBe('world1');
		expect(receivedPackets[9]).toBe('world9');
		expect(receivedPackets[10]).toBe('hi');
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

		expect(receivedPackets.length).toBe(11);
		expect(receivedPackets[0]).toBe('world0');
		expect(receivedPackets[1]).toBe('world1');
		expect(receivedPackets[9]).toBe('world9');
		expect(receivedPackets[10]).toBe('hi');
	});

	it('should support getConsumerStats method', async () => {
		let consumer = demux.listen('hello').createConsumer();

		for (let i = 0; i < 10; i++) {
			demux.write('hello', 'world' + i);
		}
		demux.close('hello', 'hi');

		let consumerStats = demux.getConsumerStats(consumer.id);
		expect(consumerStats).not.toBe(null);
		expect(consumerStats.id).toBe(consumer.id);
		expect(consumerStats.backpressure).toBe(11);
		expect(consumerStats.backpressure).toBe(consumer.getBackpressure());

		consumer.return();

		consumerStats = demux.getConsumerStats(consumer.id);
		expect(consumerStats).toBe(undefined);
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
		expect(consumerStatsList.length).toBe(2);
		expect(consumerStatsList[0].id).toBe(consumerA.id);
		expect(consumerStatsList[0].backpressure).toBe(12);
		expect(consumerStatsList[0].backpressure).toBe(consumerA.getBackpressure());
		expect(consumerStatsList[1].id).toBe(consumerB.id);
		expect(consumerStatsList[1].backpressure).toBe(2);
		expect(consumerStatsList[1].backpressure).toBe(consumerB.getBackpressure());

		consumerStatsList = demux.getConsumerStats('bar');
		expect(consumerStatsList.length).toBe(0);

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
		expect(consumerStatsList.length).toBe(3);
		expect(consumerStatsList[0].id).toBe(consumerA.id);
		expect(consumerStatsList[0].backpressure).toBe(12);
		expect(consumerStatsList[0].backpressure).toBe(consumerA.getBackpressure());
		expect(consumerStatsList[1].id).toBe(consumerB.id);
		expect(consumerStatsList[1].backpressure).toBe(2);
		expect(consumerStatsList[1].backpressure).toBe(consumerB.getBackpressure());
		expect(consumerStatsList[2].id).toBe(consumerC.id);
		expect(consumerStatsList[2].backpressure).toBe(0);
		expect(consumerStatsList[2].backpressure).toBe(consumerC.getBackpressure());

		consumerA.return();
		consumerB.return();
		consumerC.return();

		consumerStatsList = demux.getConsumerStats();
		expect(consumerStatsList.length).toBe(0);
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

		expect(receivedPackets.length).toBe(4);
		expect(receivedPackets[0].value).toBe('world0');
		expect(receivedPackets[1].value).toBe('world1');
		expect(receivedPackets[2].value).toBe('world2');
		expect(receivedPackets[3].done).toBe(true);
		expect(receivedPackets[3].value).toBe('end');
		expect(consumerA.getBackpressure()).toBe(0);
		expect(consumerB.getBackpressure()).toBe(0);
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

		expect(receivedPacketsA.length).toBe(4);
		expect(receivedPacketsA[0].value).toBe('world0');
		expect(receivedPacketsA[1].value).toBe('world1');
		expect(receivedPacketsA[2].value).toBe('world2');
		expect(receivedPacketsA[3].done).toBe(true);
		expect(receivedPacketsA[3].value).toBe('bar');
		expect(receivedPacketsC.length).toBe(4);
		expect(receivedPacketsC[0].value).toBe('world0');
		expect(receivedPacketsC[1].value).toBe('world1');
		expect(receivedPacketsC[2].value).toBe('world2');
		expect(receivedPacketsC[3].done).toBe(true);
		expect(receivedPacketsC[3].value).toBe('bar');
		expect(consumerA.getBackpressure()).toBe(0);
		expect(consumerB.getBackpressure()).toBe(0);
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

		expect(receivedPacketsA.length).toBe(4);
		expect(receivedPacketsA[0].value).toBe('world0');
		expect(receivedPacketsA[1].value).toBe('world1');
		expect(receivedPacketsA[2].value).toBe('world2');
		expect(receivedPacketsA[3].done).toBe(true);
		expect(receivedPacketsA[3].value).toBe('the end');

		expect(receivedPacketsB.length).toBe(10);
		expect(receivedPacketsB[0].value).toBe('world0');
		expect(receivedPacketsB[1].value).toBe('world1');
		expect(receivedPacketsB[9].value).toBe('world9');

		expect(consumerA.getBackpressure()).toBe(0);
		expect(consumerB.getBackpressure()).toBe(0);
	});

	it('should support getBackpressure method', async () => {
		let consumer = demux.listen('hello').createConsumer();

		demux.write('hello', 'world0');
		demux.write('hello', 'world1');

		expect(demux.getBackpressure('hello')).toBe(2);

		demux.write('hello', 'world2');
		demux.write('hello', 'world3');

		expect(demux.getBackpressure('hello')).toBe(4);

		demux.kill('hello');

		expect(demux.getBackpressure('hello')).toBe(0);
	});

	it('should support getBackpressureAll method', async () => {
		let consumerA = demux.listen('hello').createConsumer();
		let consumerB = demux.listen('hi').createConsumer();

		demux.write('hello', 'world0');
		demux.write('hello', 'world1');

		expect(demux.getBackpressure()).toBe(2);

		demux.write('hi', 'message');
		demux.write('hi', 'message');
		demux.write('hi', 'message');
		demux.write('hi', 'message');

		expect(demux.getBackpressure()).toBe(4);

		demux.kill('hi');

		expect(demux.getBackpressure()).toBe(2);

		demux.kill('hello');

		expect(demux.getBackpressure()).toBe(0);
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

		expect(demux.getBackpressure(consumerA.id)).toBe(2);
		expect(demux.getBackpressure(consumerB.id)).toBe(4);

		demux.kill('hi');

		expect(demux.getBackpressure(consumerA.id)).toBe(2);
		expect(demux.getBackpressure(consumerB.id)).toBe(0);

		demux.kill('hello');

		expect(demux.getBackpressure(consumerA.id)).toBe(0);
		expect(demux.getBackpressure(consumerB.id)).toBe(0);
	});

	it('should support hasConsumer method', async () => {
		let consumerA = demux.listen('hello').createConsumer();
		let consumerB = demux.listen('hi').createConsumer();

		expect(demux.hasConsumer('hello', 123)).toBe(false);
		expect(demux.hasConsumer('hello', consumerA.id)).toBe(true);
		expect(demux.hasConsumer('hi', consumerB.id)).toBe(true);
		expect(demux.hasConsumer('hello', consumerB.id)).toBe(false);
		expect(demux.hasConsumer('hi', consumerA.id)).toBe(false);
	});

	it('should support hasConsumerAll method', async () => {
		let consumerA = demux.listen('hello').createConsumer();
		let consumerB = demux.listen('hi').createConsumer();

		expect(demux.hasConsumer(123)).toBe(false);
		expect(demux.hasConsumer(consumerA.id)).toBe(true);
		expect(demux.hasConsumer(consumerB.id)).toBe(true);
	});
});
