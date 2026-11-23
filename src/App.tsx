import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  Eraser,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { SignaturePad, SignaturePadHandle } from './components/SignaturePad';

const ENDPOINT_URL =
  'https://script.google.com/macros/s/AKfycbzU2_i2Ej8MblJozsTFTuRfbKqBeSCZOHXBPFZVRke-CwNy8sGEdsnwpw_XHxp6QUzv/exec';

interface SubmissionResult {
  studentId: string;
  filename: string;
  previewDataUrl: string;
}

export default function App() {
  const padRef = useRef<SignaturePadHandle | null>(null);
  const studentIdInputRef = useRef<HTMLInputElement | null>(null);

  const [studentId, setStudentId] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [submission, setSubmission] = useState<SubmissionResult | null>(null);

  const trimmedId = studentId.trim();
  const previewFilename = trimmedId ? `${trimmedId}.jpg` : 'student-id.jpg';

  const clearError = useCallback(() => {
    setErrorMessage('');
  }, []);

  const handleSignatureChange = useCallback(
    (hasSig: boolean, count: number) => {
      setHasSignature(hasSig);
      setStrokeCount(count);
    },
    []
  );

  const handleUndo = useCallback(() => {
    padRef.current?.undo();
    clearError();
  }, [clearError]);

  const handleClear = useCallback(() => {
    padRef.current?.clear();
    clearError();
  }, [clearError]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (submission || isUploading) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault();
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, isUploading, submission]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();

    if (!trimmedId) {
      setErrorMessage('Please enter your Student ID Number.');
      studentIdInputRef.current?.focus();
      return;
    }

    if (!hasSignature || !padRef.current?.hasSignature()) {
      setErrorMessage('Please provide your signature before submitting.');
      return;
    }

    const filename = `${trimmedId}.jpg`;
    const image = padRef.current.exportWhiteBgJpeg();

    setIsUploading(true);

    try {
      await fetch(ENDPOINT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          studentId: trimmedId,
          filename,
          image,
        }),
      });

      setSubmission({
        studentId: trimmedId,
        filename,
        previewDataUrl: image,
      });
    } catch {
      setErrorMessage(
        'Upload failed. Please check your internet connection and try again.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmitAnother = () => {
    setSubmission(null);
    setStudentId('');
    setHasSignature(false);
    setStrokeCount(0);
    setErrorMessage('');
    requestAnimationFrame(() => {
      padRef.current?.clear();
      studentIdInputRef.current?.focus();
    });
  };

  const handleDownloadCopy = () => {
    if (!submission) return;
    const link = document.createElement('a');
    link.href = submission.previewDataUrl;
    link.download = submission.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-dvh bg-[#f4f6f9] text-slate-900 flex flex-col">
      {/* Minimal Header */}
      <header className="w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Student Digital Signature
          </span>
          <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
            Registrar Intake · White-Background JPEG
          </span>
        </div>
      </header>

      {/* Workspace */}
      <main className="flex-1 flex items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
        <div className="w-full max-w-4xl bg-white rounded-2xl border border-slate-200/90 shadow-[0_12px_36px_-12px_rgba(15,23,42,0.08)] overflow-hidden">
          {submission ? (
            /* Confirmation View */
            <section
              aria-live="polite"
              className="p-6 sm:p-10 md:p-12 text-center max-w-lg mx-auto"
            >
              <div
                aria-hidden="true"
                className="w-16 h-16 mx-auto mb-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"
              >
                <Check className="w-8 h-8 stroke-[2.6]" />
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">
                Signature Saved!
              </h1>

              <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-6">
                Your signature has been uploaded successfully.
                <br />
                Saved as{' '}
                <code className="font-mono text-sm font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                  {submission.filename}
                </code>
              </p>

              {/* Visual Receipt Preview */}
              <div className="mb-7 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2.5">
                  <span>Captured Signature</span>
                  <span className="font-mono tabular-nums">
                    ID {submission.studentId}
                  </span>
                </div>
                <div className="rounded-lg border border-slate-200/80 bg-white overflow-hidden">
                  <img
                    src={submission.previewDataUrl}
                    alt={`Saved signature for student ${submission.studentId}`}
                    className="w-full h-36 object-contain"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleDownloadCopy}
                  className="min-h-[48px] px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Copy</span>
                </button>
                <button
                  type="button"
                  onClick={handleSubmitAnother}
                  className="flex-1 min-h-[48px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-sm font-semibold inline-flex items-center justify-center transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                >
                  Submit Another
                </button>
              </div>
            </section>
          ) : (
            /* Signature Capture Form */
            <form
              onSubmit={handleSubmit}
              noValidate
              className="grid grid-cols-1 lg:grid-cols-12"
            >
              {/* Left Column: Identification & Instructions */}
              <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-100">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mb-2 text-balance">
                    Student Digital Signature
                  </h1>
                  <p className="text-sm text-slate-600 leading-relaxed mb-6">
                    Enter your Student ID Number and sign inside the pad to
                    upload your signature record.
                  </p>

                  <div className="space-y-2">
                    <label
                      htmlFor="studentId"
                      className="block text-sm font-semibold text-slate-800"
                    >
                      Student ID Number{' '}
                      <span className="text-red-600" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <input
                      ref={studentIdInputRef}
                      id="studentId"
                      name="studentId"
                      type="text"
                      value={studentId}
                      onChange={(e) => {
                        setStudentId(e.target.value);
                        clearError();
                      }}
                      placeholder="e.g. 2026-00123"
                      autoComplete="off"
                      disabled={isUploading}
                      required
                      className="w-full min-h-[48px] px-3.5 py-2.5 text-base font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-xl outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15 disabled:opacity-65 disabled:bg-slate-50"
                    />
                    <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
                      <span>Output filename</span>
                      <span
                        className={`font-mono tabular-nums ${
                          trimmedId
                            ? 'text-slate-800 font-medium'
                            : 'text-slate-400'
                        }`}
                      >
                        {previewFilename}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="hidden lg:block pt-8 mt-8 border-t border-slate-100">
                  <ol className="space-y-2 text-xs text-slate-500 leading-relaxed">
                    <li>
                      <span className="font-semibold text-slate-700">01.</span>{' '}
                      Verify your Student ID matches your enrollment record.
                    </li>
                    <li>
                      <span className="font-semibold text-slate-700">02.</span>{' '}
                      Sign along the baseline using finger, stylus, or mouse.
                    </li>
                    <li>
                      <span className="font-semibold text-slate-700">03.</span>{' '}
                      Submit to save as a high-contrast JPEG on white.
                    </li>
                  </ol>
                </div>
              </div>

              {/* Right Column: Interactive Signature Pad & Actions */}
              <div className="lg:col-span-7 p-6 sm:p-8 bg-slate-50/45 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div>
                      <span className="text-sm font-semibold text-slate-800">
                        Signature{' '}
                        <span className="text-red-600" aria-hidden="true">
                          *
                        </span>
                      </span>
                      <span className="ml-2 text-xs text-slate-500 hidden sm:inline">
                        Draw with finger or mouse
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleUndo}
                      disabled={isUploading || strokeCount === 0}
                      title="Undo last stroke (Ctrl+Z)"
                      className="min-h-[44px] px-3 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Undo</span>
                    </button>
                  </div>

                  <SignaturePad
                    ref={padRef}
                    disabled={isUploading}
                    onChange={handleSignatureChange}
                    onDrawStart={clearError}
                  />
                </div>

                <div className="mt-5 space-y-3">
                  {errorMessage && (
                    <div
                      role="alert"
                      className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200/80 text-red-700 text-sm font-medium"
                    >
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleClear}
                      disabled={isUploading}
                      className="min-h-[48px] px-5 rounded-xl bg-slate-200/80 hover:bg-slate-200 text-slate-800 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                    >
                      <Eraser className="w-4 h-4" />
                      <span>Clear</span>
                    </button>

                    <button
                      type="submit"
                      disabled={isUploading}
                      className="flex-1 min-h-[48px] px-6 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all disabled:opacity-65 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <span>Submit</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
