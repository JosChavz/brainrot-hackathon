'use client';
import { useEffect, useState } from 'react';
import { useWebContainer } from '@/app/contexts/web-container-context';
import { convertFilesToTree } from '@/utils/tree';
import PreviewTerminal from '@/components/preview-terminal/preview-terminal';
import { FileSystemTree, WebContainer } from '@webcontainer/api';
import { redirect, useParams } from "next/navigation";
import { transformGuide } from '@/utils/markdown';
import CodeMirrorEditor, { SupportedLanguage } from '@/components/code-editor/code-editor';
import Dropdown from '@/components/radix-ui/dropdown';
import { CaretLeftIcon, CaretRightIcon, CaretSortIcon } from '@radix-ui/react-icons';
import {GuideType} from '@/app/models/guide';
import { Skeleton } from '@/components/skeleton/skeleton';
import {Box, IconButton} from '@radix-ui/themes';
import { parseLanguage } from '@/utils/language';
import Image from 'next/image';
import ConfirmationModal from './guide-modal';

export default function Guide() {
  /** from the course id and guide id to fetch the appropriate user guide.
   * grab-files won't change - if a user guide exists, the files on that are going to take higher precedence
   */
  const { webContainer, setWebContainer } = useWebContainer();
  const [files, setFiles] = useState<FileSystemTree | null>(null);
  const [currentCourse, setCurrentCourse] = useState<any>(null);
  const [currentGuide, setCurrentGuide] = useState<GuideType & { parsedGuideText: string } | null>(null);
  const [currentFile, setCurrentFile] = useState<{
    file: string;
    type: SupportedLanguage;
  } | null>(null);
  const [currentFileContent, setCurrentFileContent] = useState<string>('');
  const params = useParams();
  const guideId = params.guide;
  const courseId = params.course;

  const [isModalOpen, setModalOpen] = useState(false);
  // const [reviewResult, setReviewResult] = useState<string | null>(null);


  const handleNextGuide = () => {
    setModalOpen(true); // Open modal
  };

  const handleNextGuide2 = () => {
    if (currentCourse && currentCourse.guides) {
      const nextGuideId = currentCourse.guides.findIndex((guide: any) => guide._id === guideId) + 1;
      if (nextGuideId < currentCourse.guides.length) {
        redirect(`/guide/${courseId}/${currentCourse.guides[nextGuideId]._id}`);
      }
    }
  };

  const submitForReview = async (): Promise<boolean> => {
    try {
      console.log('Submitting for review...', currentGuide?.filesToTrack);
      const filesToTrack = currentGuide?.filesToTrack;
      const updatedFiles = filesToTrack
          ? await Promise.all(
              filesToTrack.map(async (file: string) => {
                console.log('Reading file:', file);
                const content = await webContainer?.fs.readFile(file, 'utf-8');
                return {
                    fileName: file,
                    fileContent: content,
                };
              })
          )
          : [];


      const modelResponse = await fetch("/api/check-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updatedFiles
        }),
      });
      await fetch(`/api/update-user-guide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          guideId,
          updatedFiles,
        }),
      });
      const responseJson = await modelResponse.json(); // Expecting JSON response
      console.log('API Response:', responseJson.response, responseJson.response.includes('No'));

      // setReviewResult(responseJson.response || ''); // Assume the API sends a `message` field

      // Check if response indicates success
      if (responseJson.response.includes('No')) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.log('Error submitting for review:', error);
      return false;
    }
  };


  // state for tracking files

  const handleSelectGuide = (item: { name: string; id: string }) => {
    redirect(`/guide/${courseId}/${item.id}`);
  };

  const openFile = async (file: string) => {
    if (webContainer) {
      try {
        const fileContent = await webContainer.fs.readFile(file, 'utf-8');
        setCurrentFileContent(fileContent);
      } catch (error) {
        console.error(`Error opening file ${file}:`, error);
      }
    }
  };

  const writeToFile = async (fileContent: string) => {
    await webContainer?.fs.writeFile(currentFile?.file ?? '', fileContent);
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const response = await fetch(`/api/grab-files?courseId=${courseId}&guideId=${guideId}`);
        const responseJson = await response.json();
        const data: { file: string; content: string }[] = responseJson.files;
        const initFiles = convertFilesToTree(data);

        if (!webContainer) {
          const webcontainerInstance: WebContainer = await WebContainer.boot();
          await webcontainerInstance.mount(initFiles);
          setWebContainer(webcontainerInstance);
        } else {
          await webContainer.mount(initFiles);
        }

        setFiles(initFiles);
      } catch (error) {
        console.error('Page; Error fetching files:', error);
      }
    };

    fetchFiles();
  }, [webContainer]);

  useEffect(() => {
    const fetchGuide = async () => {
      try {
        if (webContainer) {
          const response = await fetch(`/api/grab-guides?id=${courseId}`);
          const responseJson = await response.json();
          const course = responseJson.response;
          const guide = course.guides.find((guide: any) => guide._id === guideId);

          if (guide) {
            const parsedHTML = await transformGuide(guide.content);
            setCurrentCourse(course);
            setCurrentGuide({ ...guide, parsedGuideText: parsedHTML });
            setCurrentFile({
              file: guide.startingFile,
              type: parseLanguage(guide.startingFile.split('.').pop() || 'unknown'),
            });
          } else {
            console.error("Guide not found!");
          }
        }
      } catch (error) {
        console.error('Error fetching guides:', error);
      }
    };

    fetchGuide();
  }, [courseId, webContainer]);

  // Call openFile whenever currentFile changes
  useEffect(() => {
    if (currentFile?.file) {
      openFile(currentFile.file);
    }
  }, [currentFile]);

  const handlePrevGuide = () => {
    if (currentCourse && currentCourse.guides) {
      const prevIndex = currentCourse.guides.findIndex((guide: any) => guide._id === guideId) - 1;
      if (prevIndex >= 0) {
        redirect(`/guide/${courseId}/${currentCourse.guides[prevIndex]._id}`);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-row max-h-[calc(100vh-68px)] overflow-y-hidden">
      <div className="w-1/3">
        <div className="border-b-[1px] border-primary p-2 flex flex-row items-center">
          <Dropdown
            label={<CaretSortIcon className="size-8" />}
            items={currentCourse?.guides.map((guide: any) => ({
              name: guide.title,
              id: guide._id,
            })) ?? []}
            onSelect={handleSelectGuide}
          />
          <div className="ml-2">
            {currentCourse?.title ? (
              <div className="h-7 text-xl font-bold mb-1">{currentCourse.title}</div>
            ) : (
              <Skeleton className="w-32 h-7 rounded-full mb-1" />
            )}
            {currentGuide?.title ? (
              <div className="h-6 text-secondary dark:text-secondary-dark">{currentGuide?.title}</div>
            ) : (
              <Skeleton className="w-44 h-6 rounded-full" />
            )}
          </div>
          <div className="ml-auto flex flex-row gap-1">
            <IconButton className='bg-transparent' onClick={handlePrevGuide}>
              <CaretLeftIcon className="size-7" />
            </IconButton>
            <IconButton className='bg-transparent' onClick={handleNextGuide}>
              <CaretRightIcon className="size-7" />
            </IconButton>
            <ConfirmationModal
              isOpen={isModalOpen}
              onClose={() => setModalOpen(false)}
              onSubmit={submitForReview}
              courseId={courseId}
              handleNextGuide2={handleNextGuide2}
            />
          </div>
        </div>
        <div className="p-4 h-[calc(100vh-68px-73px)] overflow-y-auto mb-4 flex flex-col">
          {currentGuide?.description && (
            <blockquote className="p-4 mt-2 mb-4 border-s-4 border-gray-300 bg-gray-50 dark:border-gray-500 dark:bg-gray-800">
              <p className="text-md italic font-medium leading-relaxed text-secondary dark:text-slate-200">
                {currentGuide.description}
              </p>
            </blockquote>
          )}
          {currentGuide?.image && (
            <Image
              src={currentGuide.image}
              alt="Image description"
              width={500} // Specify width
              height={500} // Specify height
              className='mb-4 self-center'
            />
          )}

          {currentGuide?.parsedGuideText && (
            <Box id={'parsed'}>
               <div className="parsed-text pb-8" dangerouslySetInnerHTML={{ __html: currentGuide?.parsedGuideText }}></div>
               <div className='h-7 text-xl font-bold mb-1'>Checklist&nbsp;&nbsp;&#x2705;</div>
               <hr></hr>
            </Box>
          )}
        </div>
      </div>
      <div className="w-2/3 flex-1 flex flex-col border-l-[1px] border-primary pl-2">
        <CodeMirrorEditor
          files={files}
          value={currentFileContent}
          onChange={writeToFile}
          setCurrentFile={setCurrentFile}
          currentFile={currentFile}
          language={currentFile?.type ?? "markdown"}
        />
        <PreviewTerminal webContainer={webContainer} />
      </div>
    </div>
  );
}
