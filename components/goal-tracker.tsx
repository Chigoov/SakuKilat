'use client'

/**
 * SakuKilat — Goal Tracker (Compatibility Bridge to GoalPlanner)
 * --------------------------------------------------------------
 * Re-exports the enhanced GoalPlanner subsystem to ensure complete
 * backward compatibility across existing call-sites (tab-beranda, data-portability, etc.).
 */

export * from './goal-planner'
export { GoalPlanner as GoalTracker, GoalPlanner as default } from './goal-planner'
