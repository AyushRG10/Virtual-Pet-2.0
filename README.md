# FBLA Virtual Pet 2026: "Eco-Bot & Friends"

## Overview
This project is a sophisticated Virtual Pet simulation built for the FBLA Coding & Programming competition. It demonstrates advanced concepts in **Financial Literacy**, **Software Engineering**, and **User Experience Design**.

## System Architecture
The application is built using a component-based Vanilla JavaScript architecture with Three.js for 3D rendering.

### Core Modules
*   **Game State Management (`STATE`)**: A centralized state object tracks all game variables (money, stats, inventory, chores), ensuring data consistency.
*   **Event-Driven Interaction**: The interaction system uses a Raycaster to detect clicks on 3D objects, dispatching actions (e.g., `doChore`, `openMarket`) through a unified handler.
*   **Room System**: A modular `buildRoom` function dynamically renders the current environment (Living Room, Kitchen, Bedroom, Bathroom) and instantiates interactive objects based on the room type.
*   **Game Loop**: A dedicated `initGameLoop` handles:
    *   **Stat Decay**: Real-time attribute reduction (Hunger, Energy, etc.).
    *   **Financial Logic**: Compound interest calculation and chore rewards.
    *   **UI Updates**: Synchronization between the logic layer and the DOM.

## Financial Model
To promote financial literacy, the game includes:
1.  **Compound Interest**: Savings accounts earn **2% interest every minute**, teaching the value of passive income.
2.  **Opportunity Cost**: Players can invest in "Education" courses. While this has an upfront cost, it permanently increases the reward for every future chore, simulating real-world R&I (Return on Investment).
3.  **Detailed Spending Reports**: A "Financial Report" dashboard categorizes expenses (Food vs. Toys vs. Education), encouraging budget awareness.

## Key Features
*   **Interactive 3D World**: Fully navigable rooms with interactive chores (Dishes, Laundry, Recycling).
*   **Responsive Design**: A fluid UI that adapts to any screen size.
*   **Accessibility**: Keyboard navigation (1-4 for rooms) and high-contrast UI elements.

## Controls
*   **Mouse**: Click to interact with objects and chores.
*   **Keys 1-4**: Switch between Living Room, Kitchen, Bedroom, and Bathroom.
*   **Spacebar**: Quick Interaction with the room's main appliance.

## Technologies
*   **Three.js**: 3D rendering engine.
*   **Tailwind CSS**: Utility-first styling for a modern, responsive UI.
*   **Vanilla JS**: Core game logic (no heavy frameworks).
