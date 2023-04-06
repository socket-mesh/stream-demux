import { WritableConsumableStream } from "@socket-mesh/writable-consumable-stream";
import { DemuxedConsumableStream } from "./demuxed-consumable-stream";
import { DemuxPacket } from "./demux-packet";
import { Consumer } from "@socket-mesh/writable-consumable-stream";
import { StreamDemuxStats } from "./stream-demux-stats";

export class StreamDemux<T> {
	private readonly _mainStream: WritableConsumableStream<DemuxPacket<T>, T>;

  constructor() {
    this._mainStream = new WritableConsumableStream<DemuxPacket<T>, T>();
  }

  write(streamName: string, value: T): void {
    this._mainStream.write({
				stream: streamName,
				data: {
					value,
					done: false
				}
			}
		);
  }

  close(consumerId: number, value?: T): void;
  close(streamName: string, value?: T): void;
  close(streamName: string | number, value?: T): void {
		if (typeof streamName === 'number') {
			this._mainStream.closeConsumer(streamName /* consumerId */ , value);
			return;
		}

    this._mainStream.write({
      stream: streamName,
      data: {
        value,
        done: true
      }
    });
  }

  closeAll(value?: T) {
    this._mainStream.close(value);
  }

  writeToConsumer(consumerId: number, value: T): void {
    this._mainStream.writeToConsumer(
			consumerId,
			{
				consumerId,
				data: {
					value,
					done: false
				}
			}
		);
  }

	getConsumerStats(): StreamDemuxStats[];
	getConsumerStats(consumerId: number): StreamDemuxStats;
	getConsumerStats(streamName: string): StreamDemuxStats[];
	getConsumerStats(consumerId?: number | string): StreamDemuxStats | StreamDemuxStats[] {
		if (!consumerId) {
			return this._mainStream.getConsumerStats().map(i => i as StreamDemuxStats);
		}

		if (typeof consumerId === 'string') {
			const consumerList = this._mainStream.getConsumerStats();

			return consumerList.map(i => i as StreamDemuxStats).filter((consumerStats) => {
				return consumerStats.stream === consumerId;
			});
		}

    return this._mainStream.getConsumerStats(consumerId) as StreamDemuxStats;
  }

  kill(consumerId: number, value?: T): void
  kill(streamName: string, value?: T): void
  kill(streamName: string | number, value?: T): void {
		if (typeof streamName === 'number') {
			this._mainStream.killConsumer(streamName /* consumerId */ , value);
			return;
		}

    let consumerList = this.getConsumerStats(streamName);
    let len = consumerList.length;

    for (let i = 0; i < len; i++) {
      this._mainStream.killConsumer(consumerList[i].id, value);
    }
  }

  killAll(value?: T) {
    this._mainStream.kill(value);
  }

  getBackpressure(streamName?: string): number;
	getBackpressure(consumerId: number): number;
  getBackpressure(streamName?: string | number): number {
		if (typeof streamName === 'string') {
			let consumerList = this.getConsumerStats(streamName);
			let len = consumerList.length;

			let maxBackpressure = 0;
			for (let i = 0; i < len; i++) {
				let consumer = consumerList[i];
				if (consumer.backpressure > maxBackpressure) {
					maxBackpressure = consumer.backpressure;
				}
			}
			return maxBackpressure;
		}

		return this._mainStream.getBackpressure(streamName /* consumerId */);
  }

	hasConsumer(consumerId: number): boolean;
  hasConsumer(streamName: string, consumerId: number): boolean;
  hasConsumer(streamName: string | number, consumerId?: number): boolean {
		if (typeof streamName === 'number') {
			return this._mainStream.hasConsumer(streamName);
		}

    const consumerStats = this._mainStream.getConsumerStats(consumerId) as StreamDemuxStats;
    return !!consumerStats && consumerStats.stream === streamName;
  }

  getConsumerCount(streamName?: string): number {
    return this.getConsumerStats(streamName).length;
  }

  createConsumer(streamName: string, timeout?: number): Consumer<T, T> {
    const mainStreamConsumer = this._mainStream.createConsumer(timeout);

    const consumerNext = mainStreamConsumer.next;

    mainStreamConsumer.next = async function () {
      while (true) {
        let packet = await consumerNext.apply(this, arguments);
        if (packet.value) {
          if (
            packet.value.stream === streamName ||
            packet.value.consumerId === this.id
          ) {
            if (packet.value.data.done) {
              this.return();
            }
            return packet.value.data;
          }
        }
        if (packet.done) {
          return packet;
        }
      }
    };

    const consumerGetStats = mainStreamConsumer.getStats;

    mainStreamConsumer.getStats = function () {
      let stats = consumerGetStats.apply(this, arguments);
      stats.stream = streamName;
      return stats;
    };

    const consumerApplyBackpressure = mainStreamConsumer.applyBackpressure;

    mainStreamConsumer.applyBackpressure = function (packet) {
      if (packet.value && typeof packet.value === 'object') {
        if (
          'stream' in packet.value && packet.value.stream === streamName ||
          'consumerId' in packet.value && packet.value.consumerId === this.id
        ) {
          consumerApplyBackpressure.apply(this, arguments);

          return;
        }
      }
      if (packet.done) {
        consumerApplyBackpressure.apply(this, arguments);
      }
    };

    const consumerReleaseBackpressure = mainStreamConsumer.releaseBackpressure;

    mainStreamConsumer.releaseBackpressure = function (packet) {
      if (packet.value && typeof packet.value === 'object') {
        if (
          'stream' in packet.value && packet.value.stream === streamName ||
          'consumerId' in packet.value && packet.value.consumerId === this.id
        ) {
          consumerReleaseBackpressure.apply(this, arguments);

          return;
        }
      }
      if (packet.done) {
        consumerReleaseBackpressure.apply(this, arguments);
      }
    };

    return mainStreamConsumer as any;
  }

  stream(streamName: string): DemuxedConsumableStream<T, T> {
    return new DemuxedConsumableStream<T, T>(this, streamName);
  }
}