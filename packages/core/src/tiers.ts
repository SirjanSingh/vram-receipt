// Tiers are jokes keyed on VRAM size. No tier line may contain a statistic.
export interface Tier {
  id: string;
  name: string;
  /** Lowest VRAM in GB that reaches this tier. */
  minGb: number;
  line: string;
  /** Accent colour for the share card and the cluster. */
  color: string;
}

export const TIERS: Tier[] = [
  { id: "spare-change", name: "Spare Change", minGb: 0, line: "Jensen didn't notice. Jensen thanks you anyway.", color: "#8f8a7a" },
  { id: "tip-jar", name: "Tip Jar", minGb: 4, line: "Every gigabyte counts. Some count more.", color: "#e7a948" },
  { id: "keynote-ticket", name: "Keynote Ticket", minGb: 8, line: "You're in the room. Back row, but in the room.", color: "#f2d16b" },
  { id: "front-row", name: "Front Row", minGb: 12, line: "Close enough to see the jacket shine.", color: "#c6f24e" },
  { id: "backstage", name: "Backstage Pass", minGb: 16, line: "The textures load. The fans spin. Life is good.", color: "#6fe3a4" },
  { id: "leather-jacket", name: "Leather Jacket", minGb: 24, line: "You don't run the model. You are the model.", color: "#5ad0f0" },
  { id: "the-kitchen", name: "The Kitchen", minGb: 32, line: "Pulled straight out of the oven.", color: "#f0f0f0" },
];

export function tierFor(vramGb: number): Tier {
  let t = TIERS[0]!;
  for (const x of TIERS) if (vramGb >= x.minGb) t = x;
  return t;
}
