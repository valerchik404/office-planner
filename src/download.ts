/** Сохранение файла: в артефакте claude.ai — через capability `downloads`
 *  (обычные ссылки-скачивания там заблокированы), иначе — обычная ссылка. */
export async function saveFile(filename: string, data: string): Promise<void> {
  const claude = (window as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
  if (claude?.use) {
    try {
      const dl = (await claude.use('downloads')) as
        | { save: (req: { filename: string; data: string }) => Promise<unknown> }
        | null;
      if (dl) {
        try {
          await dl.save({ filename, data });
        } catch {
          // пользователь отказался или лимит — не дублируем другим способом
        }
        return;
      }
    } catch {
      // capability недоступна — падаем в обычный путь
    }
  }
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
