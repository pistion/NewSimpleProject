function asNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function roundScore(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(asNumber(value, 0) * factor) / factor;
}

function validateTieBreakerScore(score) {
  const next = score === '' || score === null || score === undefined ? 0 : Number(score);
  if (!Number.isFinite(next)) throw new Error('tie-breaker score must be numeric');
  if (next < 0 || next > 1) throw new Error('tie-breaker score must be between 0.0 and 1.0');
  return roundScore(next, 2);
}

function calculateFinalScore(screeningScore, tieBreakerScore = 0) {
  return roundScore(asNumber(screeningScore, 0) + validateTieBreakerScore(tieBreakerScore), 2);
}

function sortApplicantsByScreeningScore(applicants = [], direction = 'desc') {
  return [...applicants].sort((left, right) => {
    const leftScore = asNumber(left?.screening?.screeningScore ?? left?.overallScore, 0);
    const rightScore = asNumber(right?.screening?.screeningScore ?? right?.overallScore, 0);
    if (leftScore !== rightScore) return direction === 'asc' ? leftScore - rightScore : rightScore - leftScore;
    return String(left?.id || '').localeCompare(String(right?.id || ''));
  });
}

function sortApplicantsByFinalScore(applicants = [], direction = 'desc') {
  return [...applicants].sort((left, right) => {
    const leftScore = asNumber(left?.screening?.finalScore ?? left?.finalScore, 0);
    const rightScore = asNumber(right?.screening?.finalScore ?? right?.finalScore, 0);
    if (leftScore !== rightScore) return direction === 'asc' ? leftScore - rightScore : rightScore - leftScore;
    return String(left?.id || '').localeCompare(String(right?.id || ''));
  });
}

function detectTiedScores(applicants = [], threshold = 0.5) {
  const sorted = sortApplicantsByScreeningScore(applicants, 'desc');
  const exact = [];
  const near = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const currentScore = asNumber(current?.screening?.screeningScore ?? current?.overallScore, NaN);
    const nextScore = asNumber(next?.screening?.screeningScore ?? next?.overallScore, NaN);
    if (!Number.isFinite(currentScore) || !Number.isFinite(nextScore)) continue;
    const delta = roundScore(Math.abs(currentScore - nextScore), 2);
    if (delta === 0) {
      exact.push([current.id, next.id]);
    } else if (delta <= threshold) {
      near.push([current.id, next.id]);
    }
  }

  return {
    hasTiedScores: exact.length > 0,
    hasNearTies: near.length > 0,
    exact,
    near
  };
}

function applyTieBreakerToApplicant(applicant, payload = {}) {
  const tieBreakerScore = validateTieBreakerScore(payload.tieBreakerScore ?? payload.tieBreakerPoints ?? 0);
  const screeningScore = asNumber(applicant?.screening?.screeningScore ?? applicant?.overallScore, 0);
  return {
    ...applicant,
    screening: {
      ...(applicant?.screening || {}),
      tieBreakerCriteriaId: payload.tieBreakerCriteriaId || applicant?.screening?.tieBreakerCriteriaId || null,
      tieBreakerScore,
      tieBreakerPoints: tieBreakerScore,
      tieBreakerReviewed: payload.reviewed === undefined ? true : Boolean(payload.reviewed),
      finalScore: calculateFinalScore(screeningScore, tieBreakerScore)
    }
  };
}

module.exports = {
  asNumber,
  roundScore,
  validateTieBreakerScore,
  calculateFinalScore,
  sortApplicantsByScreeningScore,
  sortApplicantsByFinalScore,
  detectTiedScores,
  applyTieBreakerToApplicant
};
