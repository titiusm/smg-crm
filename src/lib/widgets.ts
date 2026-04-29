// Widget system — typed list of available widget types and default owner layout.

export type WidgetType =
  | "pipeline_value_by_stage"
  | "rep_performance"
  | "quarterly_revenue_trend"
  | "dormant_companies"
  | "pending_approvals"
  | "high_value_prospects"
  | "activity_leaderboard"
  | "campaign_performance"
  | "my_next_actions"
  | "my_quick_stats";

export interface WidgetDef {
  type: WidgetType;
  title: string;
  description: string;
  defaultSize: { w: number; h: number; minW?: number; minH?: number };
  roles: Array<"OWNER" | "LIMITED_ADMIN" | "SALES_REP" | "REGIONAL_MANAGER">;
}

export const WIDGET_REGISTRY: Record<WidgetType, WidgetDef> = {
  pipeline_value_by_stage: {
    type: "pipeline_value_by_stage",
    title: "Pipeline value by stage",
    description: "Dollar totals of jobs at each pipeline stage.",
    defaultSize: { w: 6, h: 6, minW: 4, minH: 4 },
    roles: ["OWNER", "LIMITED_ADMIN"],
  },
  rep_performance: {
    type: "rep_performance",
    title: "Rep performance",
    description: "Activity counts + revenue with quarterly tier progress.",
    defaultSize: { w: 6, h: 6, minW: 4, minH: 4 },
    roles: ["OWNER", "LIMITED_ADMIN"],
  },
  quarterly_revenue_trend: {
    type: "quarterly_revenue_trend",
    title: "Quarterly revenue trend",
    description: "Revenue across the last 6 quarters with tier thresholds.",
    defaultSize: { w: 6, h: 5, minW: 4, minH: 3 },
    roles: ["OWNER", "LIMITED_ADMIN"],
  },
  dormant_companies: {
    type: "dormant_companies",
    title: "Dormant companies",
    description: "Companies with no project in 3+ months.",
    defaultSize: { w: 3, h: 5, minW: 2, minH: 3 },
    roles: ["OWNER", "LIMITED_ADMIN", "SALES_REP"],
  },
  pending_approvals: {
    type: "pending_approvals",
    title: "Pending approvals",
    description: "Jobs waiting on pricing approval.",
    defaultSize: { w: 3, h: 5, minW: 2, minH: 3 },
    roles: ["OWNER"],
  },
  high_value_prospects: {
    type: "high_value_prospects",
    title: "High-value prospects",
    description: "High Google review count, never contacted.",
    defaultSize: { w: 3, h: 5, minW: 2, minH: 3 },
    roles: ["OWNER", "LIMITED_ADMIN", "SALES_REP"],
  },
  activity_leaderboard: {
    type: "activity_leaderboard",
    title: "Activity leaderboard",
    description: "Calls / emails / texts per rep.",
    defaultSize: { w: 6, h: 5, minW: 4, minH: 3 },
    roles: ["OWNER", "LIMITED_ADMIN"],
  },
  campaign_performance: {
    type: "campaign_performance",
    title: "Campaign performance",
    description: "Open, reply rates across active campaigns.",
    defaultSize: { w: 6, h: 5, minW: 4, minH: 3 },
    roles: ["OWNER", "LIMITED_ADMIN"],
  },
  my_next_actions: {
    type: "my_next_actions",
    title: "My next actions",
    description: "Follow-ups due, prioritized by deal-flow tier.",
    defaultSize: { w: 6, h: 6, minW: 4, minH: 4 },
    roles: ["SALES_REP"],
  },
  my_quick_stats: {
    type: "my_quick_stats",
    title: "My quick stats",
    description: "Calls / deals / commission vs. targets.",
    defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
    roles: ["SALES_REP"],
  },
};

export interface LayoutItem {
  i: string; // widget instance id
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface WidgetInstance {
  id: string;
  type: WidgetType;
}

export function defaultOwnerLayout(): { layout: LayoutItem[]; widgets: WidgetInstance[] } {
  const widgets: WidgetInstance[] = [
    { id: "w1", type: "pipeline_value_by_stage" },
    { id: "w2", type: "rep_performance" },
    { id: "w3", type: "quarterly_revenue_trend" },
    { id: "w4", type: "dormant_companies" },
    { id: "w5", type: "pending_approvals" },
    { id: "w6", type: "high_value_prospects" },
    { id: "w7", type: "activity_leaderboard" },
    { id: "w8", type: "campaign_performance" },
  ];
  const layout: LayoutItem[] = [
    { i: "w1", x: 0, y: 0, w: 6, h: 6, minW: 4, minH: 4 },
    { i: "w2", x: 6, y: 0, w: 6, h: 6, minW: 4, minH: 4 },
    { i: "w3", x: 0, y: 6, w: 6, h: 5, minW: 4, minH: 3 },
    { i: "w4", x: 6, y: 6, w: 3, h: 5, minW: 2, minH: 3 },
    { i: "w5", x: 9, y: 6, w: 3, h: 5, minW: 2, minH: 3 },
    { i: "w6", x: 0, y: 11, w: 3, h: 5, minW: 2, minH: 3 },
    { i: "w7", x: 3, y: 11, w: 6, h: 5, minW: 4, minH: 3 },
    { i: "w8", x: 9, y: 11, w: 3, h: 5, minW: 2, minH: 3 },
  ];
  return { layout, widgets };
}

export function defaultRepLayout(): { layout: LayoutItem[]; widgets: WidgetInstance[] } {
  const widgets: WidgetInstance[] = [
    { id: "w1", type: "my_next_actions" },
    { id: "w2", type: "my_quick_stats" },
    { id: "w3", type: "dormant_companies" },
    { id: "w4", type: "high_value_prospects" },
  ];
  const layout: LayoutItem[] = [
    { i: "w1", x: 0, y: 0, w: 6, h: 6, minW: 4, minH: 4 },
    { i: "w2", x: 6, y: 0, w: 6, h: 4, minW: 4, minH: 3 },
    { i: "w3", x: 6, y: 4, w: 3, h: 5, minW: 2, minH: 3 },
    { i: "w4", x: 9, y: 4, w: 3, h: 5, minW: 2, minH: 3 },
  ];
  return { layout, widgets };
}
