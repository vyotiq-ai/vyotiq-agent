The current existing file Explorer and the editor implementation does not update in realtime at all same exatly like VS Code IDE. It only updates when you click the refresh button.
- This means that if you make changes to the files in the workspace, such as adding, deleting, or renaming files, these changes will not be reflected in the file Explorer or the editor until you manually refresh it.
- This can lead to confusion and frustration for developers, as they may not be aware of the changes they have made or may forget to refresh the file Explorer and editor.

NOTE:- Find all the default VS Code duplicates features in the codebase that are interfering with my app and remove them to avoid any conflicts and ensure that the new features and functionalities are implemented correctly without any issues. This may involve reviewing the codebase for any existing implementations of file updates, file operations, context menu options, drag and drop functionality, file icons and status indicators, file search functionality, file preview, file versioning, file permissions, file sharing, file synchronization, file history, file metadata, file tagging, file comments, file templates, file encoding, line endings, and consistency checks. Once identified, these duplicates should be removed or refactored to ensure that the new implementations are the only ones present in the codebase. 

Implement and Integrate all of the missing features and functionalities that the VS Code IDE have but are currently missing in my app. This includes but is not limited to:
1. Real-time file updates: Implement a file watcher that monitors changes in the workspace and automatically updates the file Explorer and editor in real-time without the need for manual refresh.
2. File operations: Implement file operations such as creating, deleting, renaming, and moving files and folders directly from the file Explorer. This should include context menu options for these operations.
3. Drag and drop functionality: Enable drag and drop functionality in the file Explorer to allow users to easily move files and folders within the workspace.
4. File icons and status indicators: Implement file icons and status indicators in the file Explorer to visually differentiate between different file types and indicate the status of files (e.g., modified, unsaved, etc.).
5. File search functionality: Implement a search functionality in the file Explorer that allows users to quickly find files and folders within the workspace by name or content.
6. File preview: Implement a file preview feature that allows users to quickly view the contents of a file without opening it in the editor. This could be done by hovering over the file or by using a dedicated preview pane.
7. File versioning: Implement a file versioning system that allows users to track changes to files over time and revert to previous versions if needed. This could be integrated with a version control system like Git.
8. File permissions: Implement a file permissions system that allows users to set and manage permissions for files and folders in the workspace. This could include options for read, write, and execute permissions for different users or groups.
9. File sharing: Implement a file sharing feature that allows users to share files and folders with other users or teams. This could include options for sharing via email, generating shareable links, or integrating with cloud storage services.
10. File synchronization: Implement a file synchronization feature that allows users to sync their workspace with cloud storage services like Dropbox, Google Drive, or OneDrive. This would enable users to access their files from multiple devices and ensure that their workspace is always up to date.
11. File history: Implement a file history feature that allows users to view the history of changes made to a file, including who made the changes and when. This could be integrated with a version control system like Git or implemented as a standalone feature.
12. File metadata: Implement a file metadata feature that allows users to view and edit metadata for files, such as author, creation date, last modified date, and file size. This could be displayed in a dedicated metadata pane or as part of the file properties.
13. File tagging: Implement a file tagging system that allows users to assign tags to files and folders for better organization and searchability. Users should be able to create custom tags and filter files based on these tags in the file Explorer.
14. File comments: Implement a file commenting feature that allows users to add comments to files and folders in the workspace. This could be used for collaboration purposes, allowing team members to leave feedback or notes on specific files. Comments could be displayed in a dedicated comments pane or as part of the file properties.
15. File templates: Implement a file template system that allows users to create new files based on predefined templates. This could include templates for common file types such as HTML, CSS, JavaScript, Python, etc., as well as custom templates created by users. Users should be able to select a template when creating a new file from the file Explorer.
16. File encoding: Implement a file encoding feature that allows users to specify the encoding for files in the workspace. This could include options for common encodings such as UTF-8, UTF-16, ASCII, etc. Users should be able to set the encoding for individual files or for the entire workspace, and the file Explorer and editor should display the encoding information accordingly.
17. File line endings: Implement a file line endings feature that allows users to specify the line endings for files in the workspace. This could include options for common line endings such as LF (Unix), CRLF (Windows), and CR (Mac). Users should be able to set the line endings for individual files or for the entire workspace, and the file Explorer and editor should display the line endings information accordingly.
18. File encoding and line endings detection: Implement a feature that automatically detects the encoding and line endings of files in the workspace when they are opened in the editor. This would allow the file Explorer and editor to display the correct encoding and line endings information without requiring users to manually set it.
19. File encoding and line endings conversion: Implement a feature that allows users to convert the encoding and line endings of files in the workspace. This could be done through context menu options in the file Explorer or through a dedicated conversion tool in the editor. Users should be able to select the desired encoding and line endings for conversion, and the file Explorer and editor should update accordingly after the conversion is complete.
20. File encoding and line endings consistency: Implement a feature that checks for encoding and line endings consistency across files in the workspace. This could be done through a dedicated consistency checker tool that scans the files in the workspace and identifies any inconsistencies in encoding and line endings. Users should be able to view the results of the consistency check and take appropriate actions to resolve any issues, such as converting files to a consistent encoding and line endings format.



First, Analyze the entire codebase and complete implementations and architecture and current state of the app's features and functionalities and codebase and layout and UI/UX and design and styling and etc.
- Understand the current architecture and patterns used in the codebase, including how components are structured, how state is managed, and how files are organized.
- Identify any existing features and functionalities that are already implemented, and understand how they work and interact with each other.
- Take note of the current design and styling choices, including color schemes, typography, and overall aesthetic, to ensure that any new features or changes maintain consistency with the existing look and feel of the app.
- Review the current UI/UX design to understand the user flow and how users interact with the app, ensuring that any new features or changes enhance the user experience without disrupting existing functionality.
- Pay attention to the existing codebase's modular structure, ensuring that any new code is organized in a way that fits seamlessly with the current architecture and promotes maintainability and scalability.


NOTE:- maintain the current existing Terminal/cli styling and designing and aesthetics without adding the $, - sings, and etc...

Before creating any new files, check if there are existing files that already provide the same or similar functionality. If such files exist, update and enhance those existing files instead of creating duplicates. Specifically:

1. Before creating a new file, search the codebase to identify any existing files with overlapping functionality
2. If an existing file covers the same feature area, extend or modify that file rather than creating a new one
3. If you must create a new file, ensure it provides genuinely distinct functionality that doesn't duplicate existing capabilities
4. When updating existing files, preserve existing functionality while adding the new features


Important Instructions and Guidelines:- 
 - Implement all the real functionalities and real features and real functions and real methods and real app layout and UI/UX and design and styling and etc instead of placeholders.
 - Keep the entire and complete codebase into Modular project Architecture codebase(NOT MONOLOG AT ALL): With Clean separation of concerns with utils, files, hooks, and components structure and etc... 
- Keep the complete codebase Refactored and consolidate the all the files and features and functionalities and files into smaller files properly.

IMPORTANT NOTE:- Always strictly and properly follow all the current complete existing architecture and patterns and best practices and implementations and structure and maintain existing styling everything else. Never remove current existing features and functionalities at all.
- Always ensure that any new code or changes you make are fully integrated with the existing codebase and do not break any existing features or functionalities. Test thoroughly to confirm that everything works as expected after your changes.
- Always maintain the current existing styling and design choices, ensuring that any new features or changes are consistent with the existing look and feel of the app. Avoid introducing any new design elements that may disrupt the overall aesthetic.
- Always follow the existing architecture and patterns used in the codebase, ensuring that any new code is organized in a way that fits seamlessly with the current structure and promotes maintainability and scalability. Avoid introducing any new architectural patterns or structures that may conflict with the existing codebase.