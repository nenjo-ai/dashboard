import assert from "node:assert/strict";
import test from "node:test";

import {
  countOpenInvitations,
  inviteSeatGate,
  isOpenInvitation,
} from "../lib/inviteQuotaPolicy.mjs";

const nowMs = Date.parse("2026-07-09T12:00:00.000Z");

function invitation(overrides = {}) {
  return {
    revoked_at: null,
    accepted_at: null,
    expires_at: "2026-07-10T12:00:00.000Z",
    ...overrides,
  };
}

test("only pending, unexpired invitations count against invite seats", () => {
  assert.equal(isOpenInvitation(invitation(), nowMs), true);
  assert.equal(
    isOpenInvitation(invitation({ revoked_at: "2026-07-09T12:00:00.000Z" }), nowMs),
    false,
  );
  assert.equal(
    isOpenInvitation(invitation({ accepted_at: "2026-07-09T12:00:00.000Z" }), nowMs),
    false,
  );
  assert.equal(
    isOpenInvitation(invitation({ expires_at: "2026-07-08T12:00:00.000Z" }), nowMs),
    false,
  );
});

test("active invitations are included in member seat usage", () => {
  assert.equal(
    countOpenInvitations(
      [
        invitation(),
        invitation({ accepted_at: "2026-07-09T12:00:00.000Z" }),
        invitation({ expires_at: "2026-07-08T12:00:00.000Z" }),
      ],
      nowMs,
    ),
    1,
  );
});

test("invite gate blocks when members plus open invitations reach tier limit", () => {
  assert.deepEqual(
    inviteSeatGate({
      memberCount: 1,
      openInvitationCount: 0,
      memberLimit: 1,
    }),
    {
      canInvite: false,
      seatsUsed: 1,
      seatsRemaining: 0,
    },
  );

  assert.deepEqual(
    inviteSeatGate({
      memberCount: 1,
      openInvitationCount: 1,
      memberLimit: 2,
    }),
    {
      canInvite: false,
      seatsUsed: 2,
      seatsRemaining: 0,
    },
  );
});

test("invite gate allows available and unlimited member seats", () => {
  assert.deepEqual(
    inviteSeatGate({
      memberCount: 1,
      openInvitationCount: 1,
      memberLimit: 4,
    }),
    {
      canInvite: true,
      seatsUsed: 2,
      seatsRemaining: 2,
    },
  );

  assert.deepEqual(
    inviteSeatGate({
      memberCount: 100,
      openInvitationCount: 10,
      memberLimit: -1,
    }),
    {
      canInvite: true,
      seatsUsed: 110,
      seatsRemaining: null,
    },
  );
});
