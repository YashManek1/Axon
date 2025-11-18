# DevifyX Task Frontend

This is the frontend for the DevifyX Task application, built with React and Vite. The application allows users to manage tasks efficiently with a clean and responsive interface.

## Project Structure

The project is organized as follows:

```
devifyx-task-frontend
├── public
│   └── vite.svg
├── src
│   ├── main.tsx
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   ├── vite-env.d.ts
│   ├── components
│   │   ├── common
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── Loader.tsx
│   │   └── tasks
│   │       ├── TaskList.tsx
│   │       ├── TaskItem.tsx
│   │       └── TaskForm.tsx
│   ├── pages
│   │   ├── Home.tsx
│   │   ├── Dashboard.tsx
│   │   └── NotFound.tsx
│   ├── services
│   │   ├── api.ts
│   │   └── taskService.ts
│   ├── hooks
│   │   └── useTasks.ts
│   ├── utils
│   │   ├── constants.ts
│   │   └── helpers.ts
│   ├── types
│   │   └── index.ts
│   └── assets
│       └── react.svg
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html
└── README.md
```

## Setup Instructions

To set up and run the project, follow these steps:

1. **Install dependencies:**
   Run the following command in the project root directory:
   ```
   npm install
   ```

2. **Start the development server:**
   Use the command below to start the server:
   ```
   npm run dev
   ```

3. **Build the project for production:**
   To create a production build, run:
   ```
   npm run build
   ```

4. **Preview the production build:**
   To preview the production build, use:
   ```
   npm run preview
   ```

## Features

- User-friendly interface for managing tasks.
- Responsive design for various screen sizes.
- Integration with a backend API for task management.

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue for any suggestions or improvements.

## License

This project is licensed under the MIT License.