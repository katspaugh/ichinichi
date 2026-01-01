import { Calendar } from './components/Calendar';
import { Modal } from './components/Modal';
import { NoteEditor } from './components/NoteEditor';
import { useUrlState } from './hooks/useUrlState';
import { useNotes } from './hooks/useNotes';

import './styles/theme.css';
import './styles/reset.css';
import './styles/components.css';

function App() {
  const { view, date, year, navigateToDate, navigateToCalendar, navigateToYear } = useUrlState();
  const { content, setContent, hasNote } = useNotes(date);

  const isModalOpen = view === 'note' && date !== null;

  const handleCloseModal = () => {
    navigateToCalendar(year);
  };

  return (
    <>
      <Calendar
        year={year}
        hasNote={hasNote}
        onDayClick={navigateToDate}
        onYearChange={navigateToYear}
      />

      <Modal isOpen={isModalOpen} onClose={handleCloseModal}>
        {date && (
          <NoteEditor
            date={date}
            content={content}
            onChange={setContent}
            onClose={handleCloseModal}
          />
        )}
      </Modal>
    </>
  );
}

export default App;
