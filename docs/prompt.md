Generate a prompt for me about creating a multi AI providers CLI Tool ai agent for general and real world tasks and operations and etc, with its own built-in function calling tools, so that I can give it to you. The prompt should be very detailed and comprehensive and should cover all the features and functionalities and methods and functions and etc that the CLI tool should have, along with the coding guidelines and instructions that must be strictly followed at all times in the entire codebase of the CLI tool. The prompt should also emphasize the importance of following the latest 2026 coding practices and guidelines, and should instruct to refactor any outdated code to meet these standards. Additionally, it should include instructions on how to handle existing files in the codebase when adding new features or functionalities, ensuring that duplicates are avoided and existing functionality is preserved.

## Create a Multi AI Providers CLI Tool ai agent for General and Real World Tasks and Operations

### Features and Functionalities:-

- Support for multiple AI providers (e.g., OpenAI, <https://docs.z.ai/devpack/overview> (Implement and integrate:- The GLM Coding Plan is a subscription package designed specifically for AI-powered coding. With a minimal investment, you can enjoy Zai's high-intelligence models across mainstream AI coding tools, delivering an intelligent, fast, and stable coding experience.), Anthropic, etc.) with easy configuration and switching between providers.
- Built-in function calling tools for the agent to perform various tasks and operations.
 - Tools:
   - Reading, writing, listing files with complete file system access.
   - Performing file operations such as copying, moving, deleting, and renaming files and directories.
   - Grep, glob, and search functionalities to find and extract specific information within files or data.
   - Executing multi-shell commands to perform system-level operations. Running and executing commands in the background and handling their outputs and errors effectively.

UI/UX components and Design and Styling:-
- Inline command-line interface (CLI) for easy interaction with the agent, allowing users to input messages/text and receive responses from the agent in a terminal environment.
 - Multi-turn conversations with the agent, allowing for a more natural and interactive experience.
 - Real-time streaming of the agent's responses, providing immediate feedback to the user as the agent processes and generates its output.
 - Responsive and intuitive design for the CLI, ensuring a seamless user experience across different terminal sizes and environments.
 - Multiple Ui/UX components and design elements to enhance the user experience, such as clear prompts, organized output formatting, and consistent styling throughout the application. Guidelines and Instructions:-
 - The CLI should be designed to provide a seamless and intuitive user experience, with clear prompts and responses, and should maintain a consistent styling and aesthetics throughout the application.
 - The CLI should be designed to handle various types of inputs and outputs, including text, files, and command results, while maintaining a clean and organized interface.
 - The CLI should be designed to provide real-time feedback and updates to the user, ensuring that they are informed about the status of their commands and the agent's responses.
 - The CLI should be designed to be responsive and adaptable to different terminal sizes and environments, ensuring a consistent user experience across various platforms.

- Comprehensive logging and error handling to ensure smooth operation and easy debugging.
- Modular architecture to allow for easy maintenance and scalability of the codebase.

### Tech Stack:-
- Python for the core implementation of the CLI tool and AI agent.
- Integration with various AI providers using their respective APIs and SDKs.
- Use of libraries and frameworks for CLI development (e.g., Click, argparse) to create a robust and user-friendly command-line interface.
- Use of logging libraries (e.g., logging) for comprehensive logging and error handling.
- Use of testing frameworks (e.g., pytest) for unit testing and ensuring code quality.
- Use of version control systems (e.g., Git) for code management and collaboration.
- Use of continuous integration and deployment (CI/CD) tools for automated testing and deployment of the CLI tool.
- Use of documentation tools (e.g., Sphinx) for creating comprehensive documentation for the CLI tool and its functionalities.
- Use of code linters and formatters (e.g., flake8, black) to maintain code quality and consistency.
- Use of virtual environments (e.g., venv, conda) for managing dependencies and ensuring a clean development environment.