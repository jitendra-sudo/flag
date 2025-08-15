import React from "react";
import IndianFlagValidator from "./FlagValidator"; 

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-orange-500 text-white text-center p-4 text-xl font-bold">
        🇮🇳 Indian Flag Image Validator
      </header>

      <main className="p-6">
        <IndianFlagValidator />
      </main>

      <footer className="bg-green-600 text-white text-center p-3 text-sm">
        Made with ❤️ for Independence Day Coding Challenge
      </footer>
    </div>
  );
}

export default App;
