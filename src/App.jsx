import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppStateProvider } from "./state.jsxx";
import DaysScreen from "./screens/DaysScreen.jsx";
import DayScreen from "./screens/DayScreen.jsx";
import EvaluationScreen from "./screens/EvaluationScreen.jsx";

export default function App() {
  return (
    <AppStateProvider>
      <Routes>
        <Route path="/" element={<DaysScreen />} />
        <Route path="/day/:dayId" element={<DayScreen />} />
        <Route path="/day/:dayId/eval/new" element={<EvaluationScreen mode="new" />} />
        <Route path="/day/:dayId/eval/:evId" element={<EvaluationScreen mode="edit" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppStateProvider>
  );
}
