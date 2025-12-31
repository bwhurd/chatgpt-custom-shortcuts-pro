# Changelog

Changes typically post to the chrome web store a couple days after date in changelog. 

#### [12.31.2025]
  - Fixed Thinking Standard / Extended shortcuts to select the new sprite-based Thinking time menu items reliably.
  - Fixed dictation shortcuts to work with sprite-based dictate/stop/submit buttons without triggering Voice Mode.
  - Fixed Temporary Chat toggle to use sprite-based icons (silently no-ops when the button isn’t available).
  - Fixed Think Longer shortcut to select the new sprite-based Thinking menu item via the composer “More” submenu.

#### [12.28.2025]
  - Fixed lowest-visible shortcuts so they ignore buttons hidden under the composer.
  - Copy-lowest now always strips markdown cleanly, keeping list spacing and removing leftover bold markers.
  - Rapid Alt+C presses no longer skip strip-markdown; overlapping copy timers are cancelled to keep copies consistent.

#### [12.25.2025]
  - Treat modelNames as per-profile only: export/import and Google Drive sync no longer read or write modelNames, preventing older snapshots from overwriting local labels and migrations.
  - Fixed settings hydration so cloud restore, file import, and “clear all shortcuts” immediately refresh shortcut inputs and model picker keys without reopening the popup.

#### [12.20.2025]
  - Fixed the Send Edit shortcut so it again finds the active edit card’s Send button after ChatGPT’s markup change.

#### [12.19.2025]
  - Added a toggle to click inline code snippets to copy them (disabled by default) and wired it through settings/popup.

#### [12.14.2025]
  - Model picker grid inputs now auto-select their contents when focused so clicks or Tab start overwriting immediately instead of leaving the cursor after the label.

#### [10.15.2025]
  - Backup and restore user settings with your google account. Your data is private and not exposed to us or third parties. 
  - Support for switching between all current models (GPT 5.1, 5, 4o, 4.1, 3o)
  - Use Control+/ to show all assigned shortcuts. Model picker keys display incorrectly in the overlay (but correct in settings), and the fix is expected to post around 11/17/2025.


#### [10.06.2025]
+ Added: New Custom GPT Conversation shortcut. Start a new conversation that stays with your current custom GPT, instead of switching back to the main ChatGPT model.

+ Features that were added earlier but never made it into the changelog:
  - Scroll Up Two Messages / Scroll Down Two Messages: Scrolls up or down two messages at a time.
  - Clear + Reset: Clear all shortcut keys (keeps toggles) or reset all options and shortcuts to defaults.
  - Select + Copy One Behavior: Choose whether to select any message, only ChatGPT’s responses, or only your messages.
  - Join + Copy All Messages: Simulates selecting the text of all messages and pressing Ctrl+C. Choose whether to include both user and ChatGPT, only ChatGPT (default), or only your messages; optionally remove “ChatGPT said:” and “You said:” labels.
  - Join + Copy All Responses: Join and copy every ChatGPT response in the conversation (user messages excluded), with support for a custom separator between responses.
  - Show Message Navigation Arrows: Enable arrow buttons to quickly move to the previous or next message with a click.
  - Read Aloud: Press to hear the response read aloud; press again to stop.
  - Ask to Change Response: Type how you want the previous response changed or improved.
  - More Concise / Add Details: Make the previous response shorter, or make it longer with more details.
  - Regenerate with Different Model: Create a new response using a different AI model.
  - Branch In New Chat: Copies the chat so far and starts a new conversation from this point—so you can explore a new path without losing either thread.
  - Switch model to Thinking Extended / Standard: Switch directly to GPT-5 Extended Thinking for harder problems, or GPT-5 Standard Thinking for faster answers.
  - Cancel Dictation: Cancel dictation in progress without transcribing.

#### [8.20.2025]
+ Big update with lots of new functionality:
  - Search filter in icon popup to quickly locate settings
  - Import and export settings with a JSON file for backup and restore
  - Support to use any key as shortcut (Insert, Mute, Arrow keys, most keys, etc.)
  - Assign any key to model picker including system, media, and navigation keys (e.g., Insert, Mute, Arrow keys)
  - Shortcuts to toggle most tools: Study and Learn, Create Image, Canvas, Add Photos & Files, Think Longer
  - Shortcuts for: dictate, share
  - Under the hood stuff: Changed tooltips to info icons, big updates to duplicate key logic and user dup modal popups
  - Complete update to translations
+ Fixed "Remember Sidebar Scroll Position" so it works properly on reload
  

#### [8.03.2025]
+ Added new shortcut to toggle temporary conversation
- Fixed model selection for alt+6, alt+7, and alt+8
- Fixed lowest edit button not being clicked with shortcut. 
- Fixed Bug: When highlighting text to "reply to ChatGPT", the pop-up button that you click to quote ChatGPT in your response is unintentionally faded. Working on fix with next update.

#### [7.18.2025]
Known Bug: When highlighting text to "reply to ChatGPT", the pop-up button that you click to quote ChatGPT in your response is unintentionally faded. Working on fix with next update.

+ NEW: The "edit message" shortcut has been improved. Pressing it multiple times now scrolls up through the conversation.
+ Improved user visual feedback for changing models and triggering buttons.
- Fixed bug where login-menu button is tiny and hard to see when user has not yet logged in and the "Move Top Bar to Bottom" feature is enabled
- Updated "Move Top Bar to Bottom" so user menu button is not hidden in the sidebar when this feature is enabled
- Fixed "fade slim sidebar" bug where ghost image is seen after expanding the sidebar from the smaller version.|

##### Control+Alt Modifier for Thread Navigation Added
- By pressing the default alt+j to "Go to Previous Thread", you can activate the lowest visible previous thread button. If none are visible, it will scroll up to the next button and select it.
- By using the default control+alt+j you can instead preview the next "Go to Previous Thread" selection. Adding control to this shortcut will scroll between available buttons and highlight them, but won't select them.  
- The same behavior applies to the "Go to Next Thread" shortcut.


#### [6.11.2025]
- Adjusted shortcut card margins for improved spacing.
- Switched tabs and copy-behavior controls to Puppertino scripts.
- Switched settings cards to Puppertino `.p-card` markup and styling.
- Adopted Puppertino form classes for switches and segmented controls.
- Simplified popup CSS to use built-in Puppertino fonts and spacing.
- Align popup font sizes with Puppertino layout tokens.
- Restore default card spacing.
- Wrap popup contents in Puppertino layout container.
- Simplified card CSS to inherit Puppertino defaults.
- Removed custom switch width to restore Puppertino default size.
- Fixed top bar option label targeting correct checkbox.
- Converted shortcut rows to Puppertino form markup.
- Removed custom gap spacing to use default layout.
- Restore message selection radio inputs.
- Readd leading space in separator values.
- Tweak card spacing for iOS look.
- Cleaned popup.css rules duplicated from Puppertino defaults.
- Align settings rows using Puppertino baseline layout and spacing tokens.
- Removed custom margin-left from `.p-form-switch` for consistent toggle alignment.
- Reduce shortcut row min-height to 2.75rem.
- Refined settings card headers with Puppertino subhead styling.
- Set popup background to `var(--p-silver-100)` for gray page tone.
- Overrode Puppertino text classes with smaller font sizes for iOS.



#### [6.5.2025]
- Permanently removed "Copy All" buttons; features remain accessible via keyboard shortcuts.
- Automatically disable TopBarToBottom on Codex pages.
- Handle missing arrow buttons when appending elements.

##### Removed
- Unused message caching logic.

#### [6.4.2025]
##### Fixed
- Ensure GSAP plugins register only after libraries load.
- Collapse sidebar GPT's and Folders is down for repairs
- Copy and join all code boxes is including text outside of code boxes. This feature may be retired soon.

#### [6.4.2025]
##### Fixed
- Normalized TopBarToBottom flag as a boolean and updated scroll logic.

#### [6.3.2025]
##### Changed
- Refactored visibility settings logic for content script.

#### [5.29.2025]
- Disabled collapse sidebar for time being.
- Rehid teams junk in sidebar, again.
- Added regenerate response with alt+r
- Fixed select and copy alt+x function so it works with new conversations again.
- Fixed sidebar header to slightly reduce height without shrinking the icons
- Removed alterations to tables
- Fixed "my gpt's" not having a vertical scroll bar.
- improved the bottom bar adjusting width and scaling with window size changes

#### [5.13.2025]
- Fixed collapse sidebar after changes, again.
- Rehid teams junk in sidebar, again.

#### [5.13.2025]
- Fixed collapse sidebar after changes, again.
- Rehid teams junk in sidebar, again.

#### [5.9.2025]
- Fixed collapse sidebar after changes to underlying page. New method should be more resilient. 
- Rehid teams junk in sidebar. Rehid "Explore GPTs" item when collapsed. 
- Fixed sidebar sticky header transparency bug. 

#### [5.5.2025]
- Applied CSS to constrain table width within chat, preventing horizontal scroll bars. Issue was unrelated to this extension but visually disruptive.
- Improved sync reliability for custom opacity setting on bottom bar.

#### [5.1.2025]
- Added keybord shortcuts to show the model picker
- Added keyboard shortcuts using alt or control plus numbers 1-5 to switch between models. 
- Fonally got the bottom bar opacity to consistently fade to the user set opacity. 
- 6 languages officially supported including Englisg, Spanish, Hindi, Japanese, Ukrainian and Russian. 
- Scrolling functions faster and more aggressive.  
- Fixed bug in settings where the opacity slider for bottom bar was showing even when the feature was disabled. 

#### [4.25.2025]
- Scrolling offset adjusted based on whether TopBarToBottom is active.
- Scrolling speed tweaked
- GSAP implemented in more of the css tweaks

#### [4.14.2025]
##### Added
- Option to set opacity when "Send Top Bar to Bottom" is enabled (default: 60%)
- Manual scroll interruption
- Improved error handling for sidebar collapse (fallbacks to expanded state)

##### Fixed
- Bottom bar gap after starting a new conversation and sending first message
- Known issue: "Content failed to load" when switching from project to non-project conversations with "Send Top Bar to Bottom" enabled (reload to fix or disable feature)

##### Upcoming
- Multilingual support (Spanish, Hindi, Japanese, Ukrainian, Russian) expected by end of April

---

#### [4.6.2025]
##### Added
- New "Send Top Bar to Bottom" option in Settings (clean layout, off by default)

##### Removed
- "Copy All" buttons (replaced by keyboard shortcut; subject to feedback)

---

#### [4.3.2025]
##### Fixed
- Sidebar collapse button (broken by ChatGPT UI update)
- Chrome dark mode rendering bug
- Scroll-to-message alignment accuracy

---

#### [3.31.2025]
##### Fixed
- Previous/Next thread shortcuts
- Hover behavior for edit buttons and thread nav

---

#### [3.18.2025]
##### Added
- Sidebar toggle shortcut for narrow layouts
- Persistent faint edit buttons for Alt+E
- README.md with library source clarification (for Chrome Store)

##### Fixed
- Stop-generating shortcut
- Sidebar collapse stability (optimized MutationObserver)
- Control+Backspace and Control+Enter shortcuts (enabled by default)
- Settings layout (resolved jump issue)
- Removed `clipboardRead` permission
- Silent error handling

---

#### [3.8.2025]
##### Fixed
- Header bugs from ChatGPT interface update
- Footer text re-hidden
- Scroll down one message function consistency

---

#### [2.13.2025]
##### Improved
- Scroll smoothness and reliability (powered by GSAP)
- Sidebar collapse logic

---

#### [2.11.2025]
##### Fixed
- Scroll bugs after ChatGPT removed down button
- Incorrect canvas shift when scrolling down one message

---

#### [2.6.2025]
##### Fixed
- Citation visibility issue (Teams ad interference)

---

#### [2.5.2025]
##### Fixed
- Alt key compatibility with unassigned Chrome shortcuts

---

#### [2.3.2025]
##### Updated
- Full support for Mac Option key

---

#### [1.26.2025]
##### Added
- Shortcut to collapse folders & GPTs in sidebar

---

#### [1.15.2025]
##### Added
- Select & Copy feature (beta)

---

#### [1.12.2025]
##### Added
- Previous/Next thread shortcuts

##### Fixed
- Overscroll bug on last message
- Scroll responsiveness

---

#### [1.4.2025]
##### Fixed
- Customization issue with copy shortcut

---

#### [1.3.2025]
##### Added
- Copy shortcut now strips markdown (optional)
- Toggle for "Search the Web" button
- Option to disable PageUp/PageDown behavior

##### Fixed
- Responsiveness for multi-key presses
- Performance optimizations

---

#### [12.11.2024]
##### Fixed
- Wrapped menu text bug

---

#### [12.10.2024]
##### Added
- Shortcut for native chat search

##### Fixed
- Faded native buttons below search box
- Compact sidebar header
- Date separator fix
- Sidebar Teams ad hidden again

---

#### [12.2.2024]
##### Fixed
- Alt+D shortcut update bug after settings change

---

#### [12.1.2024]
##### Fixed
- Shortcut deletion now restores default Chrome behavior

---

#### [11.25.2024]
##### Added
- Scroll one message at a time (scrolls to bottom at last message)

---

#### [11.17.2024]
##### Added
- Shortcuts for editing and resending messages

---

#### [9.22.2024]
##### Added
- Shortcut to focus chat input

##### Fixed
- Options toast notification bug
- Extension description updated (funny one)

---

#### [9.20.2024]
##### Fixed
- Sidebar toggle shortcut

---

#### [9.6.2024]
##### Fixed
- Sidebar, new conversation, and copy shortcuts

---

#### [7.21.2024]
##### Fixed
- CSS bugs

##### Added
- Options to hide menus and native "?" button

---

#### [5.21.2024]
##### Fixed
- UI bugs, restored user menu
- Header improvements pending

---

#### [5.15.2024]
##### Fixed
- Shortcuts affected by website design changes

---

#### [5.10.2024]
##### Fixed
- Alt+C now activates lowest visible copy button

---

#### [5.3.2024]
##### Fixed
- Domain redirect issue
- Restored "Join & Copy All Code" feature

---

#### [4.23.2024]
##### Fixed
- Scroll-up shortcut

---

#### [4.5.2024]
##### Added
- "Scroll to Top" shortcut

---

#### [3.19.2024]
##### Fixed
- Custom GPT icon alignment

---

#### [3.18.2024]
##### Added
- Sidebar toggle shortcut

---

#### [3.17.2024]
##### Fixed
- Scroll to Bottom, formatting bugs, and various UI issues

---

#### [1.11.2024]
##### Fixed
- Copy & new conversation shortcuts
- Corrected separator usage to `\n`

---

#### [12.10.2023]
##### Fixed
- Sticky header CSS
- Sidebar arrow display

---

#### [11.28.2023]
##### Fixed
- Restored Alt+C shortcut
- Removed broken Alt+D
- Added Alt+N for new GPT conversations

---

#### [11.4.2023]
##### Fixed
- Restored Alt+C
- HTML-related bugs
- Scroll-down function

---

#### [9.15.2023]
##### Added
- Material Design icons
- Alt+D shortcut for scroll
