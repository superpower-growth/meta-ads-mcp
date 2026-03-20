/**
 * Creative Fatigue Scoring Algorithm
 *
 * Analyzes daily time-series metrics to detect ad creative fatigue.
 * Uses frequency trends and CTR decline to produce a fatigue score (0-100)
 * with actionable recommendations.
 */

export interface DailyMetrics {
  date: string;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
}

export interface FatigueResult {
  fatigueScore: number;
  frequencyTrend: {
    current: number;
    sevenDaysAgo: number;
    change: number;
  };
  ctrTrend: {
    current: number;
    sevenDaysAgo: number;
    changePercent: number;
  };
  recommendation: 'healthy' | 'monitor' | 'rotate' | 'critical';
}

/**
 * Calculate fatigue score from daily metrics
 *
 * Score components:
 * - Frequency component (50%): Higher frequency = more fatigue
 * - CTR decline component (50%): Declining CTR = more fatigue
 *
 * @param dailyMetrics - Array of daily metrics sorted by date ascending
 * @returns FatigueResult with score, trends, and recommendation
 */
export function calculateFatigueScore(dailyMetrics: DailyMetrics[]): FatigueResult {
  if (dailyMetrics.length < 2) {
    return {
      fatigueScore: 0,
      frequencyTrend: { current: 0, sevenDaysAgo: 0, change: 0 },
      ctrTrend: { current: 0, sevenDaysAgo: 0, changePercent: 0 },
      recommendation: 'healthy',
    };
  }

  // Get recent and earlier windows for comparison
  const recentDays = dailyMetrics.slice(-3);
  const lookbackIndex = Math.max(0, dailyMetrics.length - 10);
  const earlierDays = dailyMetrics.slice(lookbackIndex, lookbackIndex + 3);

  // Calculate averages
  const avgRecent = average(recentDays, 'frequency');
  const avgEarlier = average(earlierDays, 'frequency');
  const ctrRecent = average(recentDays, 'ctr');
  const ctrEarlier = average(earlierDays, 'ctr');

  // Frequency component: scale 0-100
  // frequency > 4 starts getting concerning, > 8 is critical
  const freqScore = Math.min(100, (avgRecent / 8) * 100);

  // Frequency increase component: scale 0-100
  const freqChange = avgRecent - avgEarlier;
  const freqIncreaseScore = Math.min(100, Math.max(0, (freqChange / 5) * 100));

  // CTR decline component: scale 0-100
  const ctrChangePercent = ctrEarlier > 0
    ? ((ctrRecent - ctrEarlier) / ctrEarlier) * 100
    : 0;

  // Negative CTR change = fatigue. -50% or worse = max score
  const ctrDeclineScore = ctrChangePercent < 0
    ? Math.min(100, Math.abs(ctrChangePercent) * (100 / 50))
    : 0;

  // Combined score: frequency level (30%) + frequency increase (20%) + CTR decline (50%)
  const fatigueScore = Math.min(100, Math.round(
    freqScore * 0.3 + freqIncreaseScore * 0.2 + ctrDeclineScore * 0.5
  ));

  // Determine recommendation
  let recommendation: FatigueResult['recommendation'];
  if (fatigueScore >= 75) {
    recommendation = 'critical';
  } else if (fatigueScore >= 50) {
    recommendation = 'rotate';
  } else if (fatigueScore >= 25) {
    recommendation = 'monitor';
  } else {
    recommendation = 'healthy';
  }

  return {
    fatigueScore,
    frequencyTrend: {
      current: round(avgRecent),
      sevenDaysAgo: round(avgEarlier),
      change: round(freqChange),
    },
    ctrTrend: {
      current: round(ctrRecent),
      sevenDaysAgo: round(ctrEarlier),
      changePercent: round(ctrChangePercent),
    },
    recommendation,
  };
}

function average(metrics: DailyMetrics[], field: keyof DailyMetrics): number {
  if (metrics.length === 0) return 0;
  const sum = metrics.reduce((acc, m) => acc + (Number(m[field]) || 0), 0);
  return sum / metrics.length;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
