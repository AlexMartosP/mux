import { createContext, useContext, useReducer, type ReactNode } from "react";

// Types
export interface ReviewComment {
  id: string;
  filePath: string;
  lineNumber: number;
  lineType: "old" | "new" | "context";
  content: string;
  createdAt: string;
}

export interface ReviewState {
  comments: ReviewComment[];
  selectedFiles: Set<string>;
  selectedHunks: Map<string, Set<number>>; // filePath -> hunkIndices
}

// Actions
type ReviewAction =
  | { type: "ADD_COMMENT"; comment: ReviewComment }
  | { type: "UPDATE_COMMENT"; id: string; content: string }
  | { type: "REMOVE_COMMENT"; id: string }
  | { type: "TOGGLE_FILE_SELECTION"; filePath: string }
  | { type: "TOGGLE_HUNK_SELECTION"; filePath: string; hunkIndex: number }
  | { type: "SELECT_ALL_FILES"; filePaths: string[] }
  | { type: "DESELECT_ALL" }
  | { type: "CLEAR_REVIEW" };

// Initial state
const initialState: ReviewState = {
  comments: [],
  selectedFiles: new Set(),
  selectedHunks: new Map(),
};

// Reducer
function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "ADD_COMMENT":
      return {
        ...state,
        comments: [...state.comments, action.comment],
      };

    case "UPDATE_COMMENT":
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.id ? { ...c, content: action.content } : c
        ),
      };

    case "REMOVE_COMMENT":
      return {
        ...state,
        comments: state.comments.filter((c) => c.id !== action.id),
      };

    case "TOGGLE_FILE_SELECTION": {
      const newSelectedFiles = new Set(state.selectedFiles);
      if (newSelectedFiles.has(action.filePath)) {
        newSelectedFiles.delete(action.filePath);
      } else {
        newSelectedFiles.add(action.filePath);
      }
      return {
        ...state,
        selectedFiles: newSelectedFiles,
      };
    }

    case "TOGGLE_HUNK_SELECTION": {
      const newSelectedHunks = new Map(state.selectedHunks);
      const fileHunks = newSelectedHunks.get(action.filePath) || new Set();
      const newFileHunks = new Set(fileHunks);

      if (newFileHunks.has(action.hunkIndex)) {
        newFileHunks.delete(action.hunkIndex);
      } else {
        newFileHunks.add(action.hunkIndex);
      }

      if (newFileHunks.size === 0) {
        newSelectedHunks.delete(action.filePath);
      } else {
        newSelectedHunks.set(action.filePath, newFileHunks);
      }

      return {
        ...state,
        selectedHunks: newSelectedHunks,
      };
    }

    case "SELECT_ALL_FILES":
      return {
        ...state,
        selectedFiles: new Set(action.filePaths),
      };

    case "DESELECT_ALL":
      return {
        ...state,
        selectedFiles: new Set(),
        selectedHunks: new Map(),
      };

    case "CLEAR_REVIEW":
      return initialState;

    default:
      return state;
  }
}

// Context
interface ReviewContextValue {
  state: ReviewState;
  addComment: (comment: Omit<ReviewComment, "id" | "createdAt">) => void;
  updateComment: (id: string, content: string) => void;
  removeComment: (id: string) => void;
  toggleFileSelection: (filePath: string) => void;
  toggleHunkSelection: (filePath: string, hunkIndex: number) => void;
  selectAllFiles: (filePaths: string[]) => void;
  deselectAll: () => void;
  clearReview: () => void;
  getCommentsForFile: (filePath: string) => ReviewComment[];
  getCommentsForLine: (filePath: string, lineNumber: number, lineType: "old" | "new" | "context") => ReviewComment[];
  isFileSelected: (filePath: string) => boolean;
  isHunkSelected: (filePath: string, hunkIndex: number) => boolean;
  hasSelections: () => boolean;
  hasComments: () => boolean;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

// Provider
export function ReviewProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reviewReducer, initialState);

  const addComment = (comment: Omit<ReviewComment, "id" | "createdAt">) => {
    dispatch({
      type: "ADD_COMMENT",
      comment: {
        ...comment,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      },
    });
  };

  const updateComment = (id: string, content: string) => {
    dispatch({ type: "UPDATE_COMMENT", id, content });
  };

  const removeComment = (id: string) => {
    dispatch({ type: "REMOVE_COMMENT", id });
  };

  const toggleFileSelection = (filePath: string) => {
    dispatch({ type: "TOGGLE_FILE_SELECTION", filePath });
  };

  const toggleHunkSelection = (filePath: string, hunkIndex: number) => {
    dispatch({ type: "TOGGLE_HUNK_SELECTION", filePath, hunkIndex });
  };

  const selectAllFiles = (filePaths: string[]) => {
    dispatch({ type: "SELECT_ALL_FILES", filePaths });
  };

  const deselectAll = () => {
    dispatch({ type: "DESELECT_ALL" });
  };

  const clearReview = () => {
    dispatch({ type: "CLEAR_REVIEW" });
  };

  const getCommentsForFile = (filePath: string) => {
    return state.comments.filter((c) => c.filePath === filePath);
  };

  const getCommentsForLine = (
    filePath: string,
    lineNumber: number,
    lineType: "old" | "new" | "context"
  ) => {
    return state.comments.filter(
      (c) =>
        c.filePath === filePath &&
        c.lineNumber === lineNumber &&
        c.lineType === lineType
    );
  };

  const isFileSelected = (filePath: string) => {
    return state.selectedFiles.has(filePath);
  };

  const isHunkSelected = (filePath: string, hunkIndex: number) => {
    const fileHunks = state.selectedHunks.get(filePath);
    return fileHunks ? fileHunks.has(hunkIndex) : false;
  };

  const hasSelections = () => {
    return state.selectedFiles.size > 0 || state.selectedHunks.size > 0;
  };

  const hasComments = () => {
    return state.comments.length > 0;
  };

  return (
    <ReviewContext.Provider
      value={{
        state,
        addComment,
        updateComment,
        removeComment,
        toggleFileSelection,
        toggleHunkSelection,
        selectAllFiles,
        deselectAll,
        clearReview,
        getCommentsForFile,
        getCommentsForLine,
        isFileSelected,
        isHunkSelected,
        hasSelections,
        hasComments,
      }}
    >
      {children}
    </ReviewContext.Provider>
  );
}

// Hook
export function useReview() {
  const context = useContext(ReviewContext);
  if (!context) {
    throw new Error("useReview must be used within a ReviewProvider");
  }
  return context;
}
