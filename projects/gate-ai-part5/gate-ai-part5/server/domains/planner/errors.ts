/** A problem the student can fix; surfaced as HTTP 400 with the message as written. */
export class UserInputError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = "UserInputError";
  }
}
