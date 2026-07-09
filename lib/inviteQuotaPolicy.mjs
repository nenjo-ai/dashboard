export function isOpenInvitation(invitation, nowMs = Date.now()) {
  return Boolean(
    invitation &&
      !invitation.revoked_at &&
      !invitation.accepted_at &&
      new Date(invitation.expires_at).getTime() > nowMs,
  );
}

export function countOpenInvitations(invitations, nowMs = Date.now()) {
  return invitations.filter((invitation) => isOpenInvitation(invitation, nowMs)).length;
}

export function inviteSeatGate({
  memberCount,
  openInvitationCount,
  memberLimit,
}) {
  const seatsUsed = memberCount + openInvitationCount;
  if (memberLimit < 0) {
    return {
      canInvite: true,
      seatsUsed,
      seatsRemaining: null,
    };
  }

  return {
    canInvite: seatsUsed < memberLimit,
    seatsUsed,
    seatsRemaining: Math.max(memberLimit - seatsUsed, 0),
  };
}
