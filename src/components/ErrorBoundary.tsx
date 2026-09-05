import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** مفتاح سياقي (مثل اسم الشاشة) يُظهر الترويسة المناسبة */
  label?: string;
  onNavigate?: (tab: string) => void;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * حاجز أخطاء عام: يمنع «الشاشة السوداء» عند انهيار أي مكوّن أثناء العرض،
 * ويعرض رسالة قابلة للاسترداد بدلاً من تفريغ شجرة React بالكامل.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: unknown): void {
    console.error('[ErrorBoundary] screen crash:', error, info);
  }

  reset = (): void => {
    this.setState({ hasError: false, message: '' });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="h-16 w-16 rounded-2xl bg-rose-500/15 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-rose-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-100 mb-1">
            حدث خطأ غير متوقع في هذه الشاشة
          </h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            تعذّر عرض <strong>{this.props.label || 'المحتويات'}</strong> بسبب خطأ أثناء المعالجة.
            يمكنك إعادة المحاولة أو العودة للوحة الرئيسية.
          </p>
          {this.state.message && (
            <p className="mt-2 text-[11px] font-mono text-slate-500 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 inline-block max-w-full break-all">
              {this.state.message}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={this.reset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            إعادة المحاولة
          </button>
          {this.props.onNavigate && (
            <button
              onClick={() => {
                this.reset();
                this.props.onNavigate?.('dashboard');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors"
            >
              <Home className="w-4 h-4" />
              العودة للرئيسية
            </button>
          )}
        </div>
      </div>
    );
  }
}
