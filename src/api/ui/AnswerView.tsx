import {
  OllamaApiGenerateRequestBody,
  OllamaApiGenerateResponse,
  OllamaApiTagsResponseModel,
  RaycastImage,
} from "../types";
import {
  ErrorOllamaCustomModel,
  ErrorOllamaModelNotInstalled,
  ErrorRaycastApiNoTextSelectedOrCopied,
  ErrorRaycastApiNoTextSelected,
  ErrorRaycastApiNoTextCopied,
  ErrorRaycastModelNotConfiguredOnLocalStorage,
} from "../errors";
import { OllamaApiGenerate, OllamaApiTags } from "../ollama";
import { SetModelView } from "./SetModelView";
import * as React from "react";
import { Action, ActionPanel, Detail, Icon, LocalStorage, Toast, showToast } from "@raycast/api";
import { getSelectedText, Clipboard, getPreferenceValues } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { GetImageFromFile, GetImageFromUrl } from "../common";

const preferences = getPreferenceValues();

const defaultPrompt = new Map([
  [
    "casual",
    "Act as a writer. Make the following text more casual while keeping the core idea.\n\nOutput only with the modified text.\n",
  ],
  [
    "codeexplain",
    "Act as a developer. Explain the following code block step by step.\n\nOutput only with the commented code.\n",
  ],
  [
    "confident",
    "Act as a writer. Make the following text more confident while keeping the core idea.\n\nOutput only with the modified text.\n",
  ],
  [
    "explain",
    "Act as a writer. Explain the following text in simple and concise terms.\n\nOutput only with the modified text.\n",
  ],
  [
    "fix",
    "Act as a writer. Fix the following text from spelling and grammar error.\n\nOutput only with the fixed text.\n",
  ],
  [
    "friendly",
    "Act as a writer. Make the following text more friendly while keeping the core idea.\n\nOutput only with the modified text.\n",
  ],
  [
    "improve",
    "Act as a writer. Improve the writing of the following text while keeping the core idea.\n\nOutput only with the modified text.\n",
  ],
  [
    "longher",
    "Act as a writer. Make the following text longer and more rich while keeping the core idea.\n\nOutput only with the modified text.\n",
  ],
  [
    "professional",
    "Act as a writer. Make the following text more professional while keeping the core idea.\n\nOutput only with the modified text.\n",
  ],
  [
    "shorter",
    "Act as a writer. Make the following text shorter while keeping the core idea.\n\nOutput only with the modified text.\n",
  ],
  ["translate", "Act as a translator. Translate the following text.\n\nOutput only with the translated text.\n"],
  [
    "tweet",
    "You are a content marketer who needs to come up with a short but succinct tweet. Make sure to include the appropriate hashtags and links. All answers should be in the form of a tweet which has a max size of 280 characters. Every instruction will be the topic to create a tweet about.\n\nOutput only with the modified text.\n",
  ],
  ["image", "Describe the content on the following images."],
]);

/**
 * Return JSX element with generated text and relative metadata.
 * @param {string} command - Command name.
 * @param {string | undefined} systemPrompt - System Prompt.
 * @param {string | undefined} model - Model used for inference.
 * @returns {JSX.Element} Raycast Answer View.
 */
export function AnswerView(
  command: string | undefined = undefined,
  model: string | undefined = undefined
): JSX.Element {
  const {
    data: ModelGenerate,
    revalidate: RevalidateModelGenerate,
    isLoading: IsLoadingModelGenerate,
  } = usePromise(GetModel, [command, model], {
    onError: HandleError,
  });
  const ModelGenerateFamilies: React.MutableRefObject<string[] | undefined> = React.useRef(undefined);
  const [loading, setLoading]: [boolean, React.Dispatch<React.SetStateAction<boolean>>] = React.useState(false);
  const [answer, setAnswer]: [string, React.Dispatch<React.SetStateAction<string>>] = React.useState("");
  const [answerMetadata, setAnswerMetadata]: [
    OllamaApiGenerateResponse,
    React.Dispatch<React.SetStateAction<OllamaApiGenerateResponse>>
  ] = React.useState({} as OllamaApiGenerateResponse);
  const [showAnswerMetadata, setShowAnswerMetadata] = React.useState(false);

  /**
   * Handle Error from Ollama API.
   * @param {Error} err - Error object.
   * @returns {Promise<void>}
   */
  async function HandleError(err: Error): Promise<void> {
    if (err instanceof ErrorOllamaModelNotInstalled || err === ErrorRaycastModelNotConfiguredOnLocalStorage) {
      if (err instanceof ErrorOllamaModelNotInstalled)
        await showToast({ style: Toast.Style.Failure, title: err.message, message: err.suggest });
      if (err === ErrorRaycastModelNotConfiguredOnLocalStorage)
        await showToast({ style: Toast.Style.Failure, title: err.message });
      if (command === "image") ModelGenerateFamilies.current = ["clip"];
      setShowSelectModelForm(true);
      return;
    } else if (err instanceof ErrorOllamaCustomModel) {
      await showToast({
        style: Toast.Style.Failure,
        title: err.message,
        message: `Model: ${err.model}, File: ${err.file}`,
      });
      return;
    } else {
      await showToast({ style: Toast.Style.Failure, title: err.message });
    }
  }

  /**
   * Start Inference with Ollama API.
   * @param {string} query - Query.
   * @param {string[]} images - Images.
   * @returns {Promise<void>}
   */
  async function Inference(query: string, images: string[] | undefined = undefined): Promise<void> {
    await showToast({ style: Toast.Style.Animated, title: "🧠 Performing Inference." });
    setLoading(true);
    const body = {
      model: ModelGenerate?.name,
      prompt: query,
      images: images,
    } as OllamaApiGenerateRequestBody;
    if (command) body.system = defaultPrompt.get(command);
    OllamaApiGenerate(body)
      .then(async (emiter) => {
        emiter.on("data", (data) => {
          setAnswer((prevState) => prevState + data);
        });

        emiter.on("done", async (data) => {
          await showToast({ style: Toast.Style.Success, title: "🧠 Inference Done." });
          setAnswerMetadata(data);
          setLoading(false);
        });
      })
      .catch(async (err) => {
        await HandleError(err);
      });
  }

  /**
   * If `model` is undefined get model from LocalStorage.
   * @param {string | undefined} command - Command name.
   * @param {string | undefined} model - Model used for inference.
   * @returns {Promise<OllamaApiShowResponse>} Model.
   */
  async function GetModel(command: string | undefined, model: string | undefined): Promise<OllamaApiTagsResponseModel> {
    const tags = await OllamaApiTags();
    if (!model) {
      model = await LocalStorage.getItem(`${command}_model_generate`);
      if (!model) {
        throw ErrorRaycastModelNotConfiguredOnLocalStorage;
      }
    }
    const m = tags.models.find((t) => t.name === model);
    if (!m) throw new ErrorOllamaModelNotInstalled("Model not installed", model);
    return m;
  }

  /**
   * Run Command
   */
  async function Run() {
    if (ModelGenerate) {
      setAnswer("");
      switch (command) {
        case "image": {
          ModelGenerateFamilies.current = ["clip"];
          let image: RaycastImage | undefined;
          const clip = await Clipboard.read();
          if (clip.file)
            image = await GetImageFromFile(clip.file).catch(async (err) => {
              await showToast({ style: Toast.Style.Failure, title: err });
              return undefined;
            });
          if (!image && clip.text)
            image = await GetImageFromUrl(clip.text).catch(async (err) => {
              await showToast({ style: Toast.Style.Failure, title: err });
              return undefined;
            });
          if (image) {
            setAnswer(`<img src="${image?.path}" alt="image" height="180" width="auto">\n`);
            Inference(" ", [image.base64]);
          }
          break;
        }
        default:
          switch (preferences.ollamaResultViewInput) {
            case "SelectedText":
              getSelectedText()
                .then((text) => {
                  Inference(text);
                })
                .catch(async () => {
                  if (preferences.ollamaResultViewInputFallback) {
                    Clipboard.readText()
                      .then((text) => {
                        if (text === undefined) throw "Empty Clipboard";
                        Inference(text);
                      })
                      .catch(async () => {
                        await showToast({
                          style: Toast.Style.Failure,
                          title: ErrorRaycastApiNoTextSelectedOrCopied.message,
                        });
                      });
                  } else {
                    await showToast({ style: Toast.Style.Failure, title: ErrorRaycastApiNoTextSelected.message });
                  }
                });
              break;
            case "Clipboard":
              Clipboard.readText()
                .then((text) => {
                  if (text === undefined) throw "Empty Clipboard";
                  Inference(text);
                })
                .catch(async () => {
                  if (preferences.ollamaResultViewInputFallback) {
                    getSelectedText()
                      .then((text) => {
                        Inference(text);
                      })
                      .catch(async () => {
                        await showToast({
                          style: Toast.Style.Failure,
                          title: ErrorRaycastApiNoTextSelectedOrCopied.message,
                        });
                      });
                  } else {
                    await showToast({ style: Toast.Style.Failure, title: ErrorRaycastApiNoTextCopied.message });
                  }
                });
              break;
          }
      }
    }
  }

  React.useEffect(() => {
    Run();
  }, [ModelGenerate]);

  const [showSelectModelForm, setShowSelectModelForm]: [boolean, React.Dispatch<React.SetStateAction<boolean>>] =
    React.useState(false);

  React.useEffect(() => {
    if (!showSelectModelForm) RevalidateModelGenerate();
  }, [showSelectModelForm]);

  if (showSelectModelForm && command)
    return (
      <SetModelView Command={command} ShowModelView={setShowSelectModelForm} Families={ModelGenerateFamilies.current} />
    );

  /**
   * Answer Action Menu.
   * @returns {JSX.Element}
   */
  function AnswerAction(): JSX.Element {
    return (
      <ActionPanel title="Actions">
        <Action.CopyToClipboard content={answer} />
        <Action
          title={showAnswerMetadata ? "Hide Metadata" : "Show Metadata"}
          icon={showAnswerMetadata ? Icon.EyeDisabled : Icon.Eye}
          shortcut={{ modifiers: ["cmd"], key: "y" }}
          onAction={() => setShowAnswerMetadata((prevState) => !prevState)}
        />
        <Action title="Retry" onAction={Run} shortcut={{ modifiers: ["cmd"], key: "r" }} icon={Icon.Repeat} />
        <Action
          title="Change Model"
          icon={Icon.Box}
          onAction={() => setShowSelectModelForm(true)}
          shortcut={{ modifiers: ["cmd"], key: "m" }}
        />
      </ActionPanel>
    );
  }

  /**
   * Answer Metadata.
   * @param prop
   * @returns {JSX.Element}
   */
  function AnswerMetadata(prop: { answer: OllamaApiGenerateResponse; tag: OllamaApiTagsResponseModel }): JSX.Element {
    return (
      <Detail.Metadata>
        <Detail.Metadata.Label title="Model" text={prop.tag.name} />
        <Detail.Metadata.Label title="Family" text={prop.tag.details.family} />
        {prop.tag.details.families && prop.tag.details.families.length > 0 && (
          <Detail.Metadata.TagList title="Families">
            {prop.tag.details.families.map((f) => (
              <Detail.Metadata.TagList.Item text={f} />
            ))}
          </Detail.Metadata.TagList>
        )}
        <Detail.Metadata.Label title="Parameter Size" text={prop.tag.details.parameter_size} />
        <Detail.Metadata.Label title="Quantization Level" text={prop.tag.details.quantization_level} />
        <Detail.Metadata.Separator />
        {prop.answer.eval_count && prop.answer.eval_duration ? (
          <Detail.Metadata.Label
            title="Generation Speed"
            text={`${(prop.answer.eval_count / (prop.answer.eval_duration / 1e9)).toFixed(2)} token/s`}
          />
        ) : null}
        {prop.answer.total_duration ? (
          <Detail.Metadata.Label
            title="Total Inference Duration"
            text={`${(prop.answer.total_duration / 1e9).toFixed(2)}s`}
          />
        ) : null}
        {prop.answer.load_duration ? (
          <Detail.Metadata.Label title="Load Duration" text={`${(prop.answer.load_duration / 1e9).toFixed(2)}s`} />
        ) : null}
        {prop.answer.prompt_eval_count ? (
          <Detail.Metadata.Label title="Prompt Eval Count" text={`${prop.answer.prompt_eval_count}`} />
        ) : null}
        {prop.answer.prompt_eval_duration ? (
          <Detail.Metadata.Label
            title="Prompt Eval Duration"
            text={`${(prop.answer.prompt_eval_duration / 1e9).toFixed(2)}s`}
          />
        ) : null}
        {prop.answer.eval_count ? (
          <Detail.Metadata.Label title="Eval Count" text={`${prop.answer.eval_count}`} />
        ) : null}
        {prop.answer.eval_duration ? (
          <Detail.Metadata.Label title="Eval Duration" text={`${(prop.answer.eval_duration / 1e9).toFixed(2)}s`} />
        ) : null}
      </Detail.Metadata>
    );
  }

  return (
    <Detail
      markdown={answer}
      isLoading={loading || IsLoadingModelGenerate}
      actions={!loading && !IsLoadingModelGenerate && <AnswerAction />}
      metadata={
        !loading &&
        !IsLoadingModelGenerate &&
        ModelGenerate &&
        answerMetadata &&
        showAnswerMetadata && <AnswerMetadata answer={answerMetadata} tag={ModelGenerate} />
      }
    />
  );
}