"use client";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const PRIMARY = "#0F1E3A";
const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const colorFor = (v: number) => (v < 50 ? "#B91C1C" : v < 80 ? "#E08A12" : "#15803D");

export function ScoreLineChart({ data, height = 240 }: { data: { date: string; score: number; title?: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF3" />
        <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={12} stroke="#5B6B82" />
        <YAxis domain={[0, 100]} fontSize={12} stroke="#5B6B82" />
        <Tooltip
          labelFormatter={(l) => fmtDay(String(l))}
          formatter={(v: number, _n, p) => [`${v} ball`, (p.payload as { title?: string }).title ?? "Ball"]}
        />
        <Line type="monotone" dataKey="score" stroke={PRIMARY} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ActivityBars({ data }: { data: { day: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={60}>
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <Tooltip labelFormatter={(l) => fmtDay(String(l))} formatter={(v: number) => [`${v} ta`, "Mashq"]} />
        <XAxis dataKey="day" hide />
        <Bar dataKey="count" fill={PRIMARY} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TagBarChart({ data, height = 280 }: { data: { tag: string; avg: number; count: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF3" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} fontSize={12} stroke="#5B6B82" />
        <YAxis type="category" dataKey="tag" width={140} fontSize={12} stroke="#3B4A63" />
        <Tooltip formatter={(v: number, _n, p) => [`${v} ball (${(p.payload as { count: number }).count} ta javob)`, "O'rtacha"]} />
        <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
          {data.map((d) => (
            <Cell key={d.tag} fill={colorFor(d.avg)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Kategoriya bo'yicha sanoq (gorizontal ustunlar). */
export function CountBarChart({ data, unit = "ta", color = PRIMARY, height }: { data: { label: string; value: number }[]; unit?: string; color?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, data.length * 36 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} fontSize={12} stroke="#5B6B82" />
        <YAxis type="category" dataKey="label" width={170} fontSize={12} stroke="#3B4A63" />
        <Tooltip formatter={(v: number) => [`${v} ${unit}`, "Soni"]} />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
