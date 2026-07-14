# PPD Store - Backend API

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg?cacheSeconds=2592000)
![NestJS](https://img.shields.io/badge/NestJS-11.0-E0234E?style=flat&logo=nestjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-9.0-4EA94B?style=flat&logo=mongodb&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-007ACC?style=flat&logo=typescript&logoColor=white)
![NodeJS](https://img.shields.io/badge/Node.js-v18+-43853D?style=flat&logo=node.js&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

> **The enterprise-grade backend API and business logic engine powering the PPD Store e-commerce platform.**

## 📖 Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture & Domain-Driven Design](#architecture--domain-driven-design)
- [Technology Stack](#technology-stack)
- [API Documentation](#api-documentation)
- [Getting Started](#getting-started)
- [Security Measures](#security-measures)
- [License](#license)

---

## 🌟 Overview

This repository contains the backend infrastructure for PPD Store. Engineered with **NestJS**, it provides a robust, highly scalable, and modular RESTful API capable of handling complex e-commerce workflows.

It is designed to be the central brain of the platform, safely orchestrating secure user authentication, complex inventory management, financial transactions via Razorpay, and asynchronous email notifications. Built with strict TypeScript typings and heavily relying on Dependency Injection, the architecture ensures absolute maintainability as the platform scales.

---

## ✨ Key Features

### 🔐 Security & Identity
- **JWT Authentication:** Stateless authentication strategy utilizing `Passport.js`.
- **Role-Based Access Control (RBAC):** Custom NestJS Guards ensuring administrative endpoints are entirely inaccessible to standard customers.
- **Data Sanitization:** Global Validation Pipes utilizing `class-validator` to strictly enforce DTO (Data Transfer Object) schemas.

### 💳 Financial Logistics
- **Razorpay Integration:** Full server-side integration for creating orders and cryptographically verifying payment signatures via Webhooks/callbacks.
- **Order Lifecycle Management:** State machine logic moving orders from `PENDING` -> `PROCESSING` -> `SHIPPED` -> `DELIVERED`.

### 📦 Content & Inventory
- **Dynamic Catalog:** Full CRUD capabilities for hierarchical categories and complex product variants.
- **Media Storage:** Native local file upload handling via `Multer`, allowing static asset serving directly through Express.
- **Bulk Imports:** Excel/CSV parsing logic for rapidly ingesting hundreds of products.

### ✉️ Communications
- **Transactional Emails:** Asynchronous email dispatch using `Nodemailer` for user onboarding, order confirmations, and password resets.

---

## 🏗 Architecture & Domain-Driven Design

The codebase strictly follows NestJS's modular, domain-driven design pattern. Each feature encapsulates its own controllers, services, schemas, and DTOs.

```text
src/
├── main.ts              # Bootstrap application, CORS, Helmet, and Swagger setup
├── app.module.ts        # Root application module orchestrating domain modules
├── common/              # Global interceptors, custom decorators, and exception filters
└── modules/             # Domain-specific bounded contexts
    ├── auth/            # JWT strategies, Auth Guards, Auth Controllers
    ├── users/           # User schemas, profiles, and password hashing
    ├── products/        # Product schemas, DTOs, and inventory logic
    ├── orders/          # Order tracking, cart validation, and status updates
    ├── payments/        # Razorpay SDK integration and signature validation
    ├── mail/            # Nodemailer transport configurations and templates
    └── uploads/         # Multer configuration and static file routing
```

---

## 💻 Technology Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | Node.js | Fast, scalable JavaScript runtime |
| **Framework** | NestJS 11 | Progressive Node.js framework leveraging OOP, FP, and FRP |
| **Language** | TypeScript | Enterprise-grade static type safety |
| **Database** | MongoDB | Highly flexible NoSQL document database |
| **ODM** | Mongoose | Elegant MongoDB object modeling |
| **Authentication** | Passport.js (JWT) | Industry-standard authentication middleware |
| **Validation** | Class-Validator & Class-Transformer | Decorator-based property validation |
| **Payments** | Razorpay Node SDK | Payment gateway abstraction |
| **Mail** | Nodemailer | Reliable SMTP email delivery |
| **Documentation** | Swagger (OpenAPI) | Auto-generated, interactive API documentation |

---

## 📚 API Documentation

The API is fully documented utilizing the NestJS Swagger module. It provides a beautiful, interactive UI to test endpoints, view request/response schemas, and authenticate via Bearer Tokens directly in the browser.

Once the development server is booted, access the documentation at:
👉 **`http://localhost:3000/api/docs`**

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- MongoDB (Running locally via Docker/Homebrew, or a MongoDB Atlas URI)

### 1. Installation
Clone the repository and install the dependencies:
```bash
cd backend
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root of the `backend` directory. **Do not commit this file.**
```env
# Server
PORT=3000
API_PREFIX=api/v1
CORS_ORIGIN=http://localhost:5173

# Database
MONGO_URI=mongodb://localhost:27017/ppd-store

# Security
JWT_SECRET=generate_a_strong_random_secret_here
JWT_EXPIRATION=7d

# Razorpay Config
RAZORPAY_KEY=your_razorpay_key_id
RAZORPAY_SECRET=your_razorpay_key_secret

# SMTP Email Config (Example using Gmail or Resend)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_email_password
```

### 3. Development Server
Run the NestJS application in watch mode:
```bash
npm run start:dev
```
The API will be accessible at `http://localhost:3000/api/v1`.

---

## 🛡️ Security Measures
- **Helmet:** Automatically sets 14+ HTTP headers to mitigate cross-site scripting (XSS), clickjacking, and other web vulnerabilities.
- **CORS:** Strictly configured to only allow requests from the official frontend origin.
- **Rate Limiting:** (Planned) `nestjs/throttler` integration to prevent brute-force and DDoS attacks.
- **Password Hashing:** `bcrypt` integration for secure, salted password storage.

---

## 📄 License

**MIT License**

Copyright (c) 2026 PPD Store

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
