import {
  ALL_CHANNEL_CLAIMANTS,
  ALL_VISUAL_CHANNELS,
  CHANNEL_PRECEDENCE,
} from "../app/lib/channels";

console.log(
  JSON.stringify({
    visualChannels: ALL_VISUAL_CHANNELS,
    channelClaimants: ALL_CHANNEL_CLAIMANTS,
    channelPrecedence: CHANNEL_PRECEDENCE,
  }),
);
