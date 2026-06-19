import React, { useState } from 'react';

export default function BmiCalculator() {
  const [weight, setWeight] = useState(70);
  const [height, setHeight] = useState(175);

  const bmi = (weight / ((height / 100) ** 2)).toFixed(1);

  const getMetrics = (val) => {
    if (val < 18.5) return { text: 'Underweight', color: 'text-blue-600 bg-blue-50' };
    if (val < 25) return { text: 'Healthy Weight', color: 'text-emerald-600 bg-emerald-50' };
    if (val < 30) return { text: 'Overweight', color: 'text-amber-600 bg-amber-50' };
    return { text: 'Obese', color: 'text-rose-600 bg-rose-50' };
  };

  const stats = getMetrics(parseFloat(bmi));

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">⚖️ Live BMI Calculator</h3>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>WEIGHT</span> <span className="text-slate-800 font-bold">{weight} kg</span>
          </div>
          <input type="range" min="40" max="150" value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600" />
        </div>
        <div>
          <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>HEIGHT</span> <span className="text-slate-800 font-bold">{height} cm</span>
          </div>
          <input type="range" min="120" max="220" value={height} onChange={(e) => setHeight(Number(e.target.value))} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-teal-500" />
        </div>
        <div className="p-4 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-100 mt-2">
          <div>
            <span className="text-xs text-slate-400 block font-medium">YOUR STATUS</span>
            <span className="text-3xl font-black text-slate-900 tracking-tight">{bmi}</span>
          </div>
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${stats.color}`}>{stats.text}</span>
        </div>
      </div>
    </div>
  );
}